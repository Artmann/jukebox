import { Cast } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

import { useSaveProgress } from '../hooks/useSaveProgress'

interface CastButtonProps {
  episodeId?: number
  movieId?: number
  player: Player | null
  streamUrl: string
  title: string
}

interface RemotePlayerLike {
  currentTime: number
  duration: number
  isConnected: boolean
}

interface RemotePlayerControllerLike {
  addEventListener: (event: string, handler: () => void) => void
  removeEventListener: (event: string, handler: () => void) => void
}

interface CastContextLike {
  requestSession: () => Promise<void>
  getCurrentSession: () => CastSessionLike | null
}

interface CastSessionLike {
  loadMedia: (request: unknown) => Promise<void>
}

interface ChromeCastWindow {
  cast?: {
    framework: {
      CastContext: {
        getInstance: () => CastContextLike
      }
      RemotePlayer: new () => RemotePlayerLike
      RemotePlayerController: new (
        player: RemotePlayerLike
      ) => RemotePlayerControllerLike
      RemotePlayerEventType: {
        IS_CONNECTED_CHANGED: string
        CURRENT_TIME_CHANGED: string
      }
      CastContextEventType: {
        CAST_STATE_CHANGED: string
      }
    }
  }
  chrome?: {
    cast?: {
      media: {
        MediaInfo: new (contentId: string, contentType: string) => unknown
        LoadRequest: new (mediaInfo: unknown) => { currentTime?: number }
      }
      AutoJoinPolicy: { ORIGIN_SCOPED: string }
    }
  }
  __onGCastApiAvailable?: (isAvailable: boolean) => void
}

const castWindow = (): ChromeCastWindow => window as unknown as ChromeCastWindow

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl
  }

  return `${window.location.origin}${pathOrUrl}`
}

// AirPlay support is a browser capability (Safari only), so it can be
// detected once at module load instead of being synced into state.
function detectAirplaySupport(): boolean {
  if (typeof HTMLVideoElement === 'undefined') {
    return false
  }

  return 'webkitShowPlaybackTargetPicker' in HTMLVideoElement.prototype
}

const airplayAvailable = detectAirplaySupport()

function readInitialCastingState(): boolean {
  try {
    const wnd = castWindow()
    const framework = wnd.cast?.framework

    if (!framework || !wnd.chrome?.cast) {
      return false
    }

    const remote = new framework.RemotePlayer()

    return remote.isConnected
  } catch {
    return false
  }
}

function showAirplayPicker(): void {
  const video = document.querySelector('video') as
    | (HTMLVideoElement & {
        webkitShowPlaybackTargetPicker?: () => void
      })
    | null

  if (video?.webkitShowPlaybackTargetPicker) {
    video.webkitShowPlaybackTargetPicker()
  }
}

export function CastButton({
  episodeId,
  movieId,
  player,
  streamUrl,
  title
}: CastButtonProps) {
  // If the Cast SDK is already on the page the button can render right away;
  // otherwise the SDK's ready callback flips this on once it loads.
  const [chromecastAvailable, setChromecastAvailable] = useState(() => {
    const wnd = castWindow()

    return Boolean(wnd.cast?.framework && wnd.chrome?.cast)
  })
  const remoteRef = useRef<RemotePlayerLike | null>(null)
  const controllerRef = useRef<RemotePlayerControllerLike | null>(null)
  const castingListenersRef = useRef<Set<() => void> | null>(null)
  const { mutate: saveProgress } = useSaveProgress()

  const getCastingListeners = () => {
    if (castingListenersRef.current === null) {
      castingListenersRef.current = new Set()
    }

    return castingListenersRef.current
  }

  const subscribeToCasting = useCallback((onStoreChange: () => void) => {
    getCastingListeners().add(onStoreChange)

    return () => {
      getCastingListeners().delete(onStoreChange)
    }
  }, [])

  const getCastingSnapshot = useCallback(() => {
    return remoteRef.current?.isConnected ?? readInitialCastingState()
  }, [])

  const isCasting = useSyncExternalStore(
    subscribeToCasting,
    getCastingSnapshot,
    () => false
  )

  const notifyCastingChange = () => {
    const listeners = castingListenersRef.current

    if (listeners === null) {
      return
    }

    for (const listener of listeners) {
      listener()
    }
  }

  const handleConnectedChange = useEffectEvent((remote: RemotePlayerLike) => {
    notifyCastingChange()

    if (player && !remote.isConnected && remote.currentTime > 0) {
      // Resume locally from the remote position.
      player.currentTime(remote.currentTime)
      void player.play()
    }
  })

  const handleRemoteTimeChange = useEffectEvent((remote: RemotePlayerLike) => {
    if (!remote.isConnected) {
      return
    }

    const progressUrl = episodeId
      ? `/api/progress/episode/${episodeId}`
      : movieId
        ? `/api/progress/${movieId}`
        : null

    if (!progressUrl) {
      return
    }

    // Best-effort progress save; failures stay in the mutation state.
    saveProgress({
      currentTime: remote.currentTime,
      duration: remote.duration,
      progressUrl
    })
  })

  // Detect Chromecast availability by waiting for the SDK. Runs once per
  // mount — the SDK, remote player, and controller are all app-global.
  useEffect(() => {
    let cancelled = false
    let removeListeners: (() => void) | null = null

    const initialise = () => {
      if (cancelled) {
        return
      }

      const wnd = castWindow()
      const framework = wnd.cast?.framework

      if (!framework || !wnd.chrome?.cast) {
        return
      }

      try {
        const context = framework.CastContext.getInstance()
        const remote = remoteRef.current ?? new framework.RemotePlayer()
        const controller =
          controllerRef.current ?? new framework.RemotePlayerController(remote)

        remoteRef.current = remote
        controllerRef.current = controller

        const onConnectedChange = () => handleConnectedChange(remote)
        const onTimeChange = () => handleRemoteTimeChange(remote)

        controller.addEventListener(
          framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
          onConnectedChange
        )
        controller.addEventListener(
          framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
          onTimeChange
        )

        removeListeners = () => {
          controller.removeEventListener(
            framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
            onConnectedChange
          )
          controller.removeEventListener(
            framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
            onTimeChange
          )
        }

        // Best-effort availability. If the user has a Chromecast on LAN,
        // requestSession will show the picker; if not, it will error cleanly.
        void context
      } catch (error) {
        console.warn('Cast framework initialisation failed:', error)
      }
    }

    // The Cast SDK calls __onGCastApiAvailable when ready.
    const wnd = castWindow()
    const existing = wnd.__onGCastApiAvailable

    const onCastApiAvailable = (isAvailable: boolean) => {
      existing?.(isAvailable)

      if (isAvailable) {
        initialise()
        setChromecastAvailable(true)
      }
    }

    wnd.__onGCastApiAvailable = onCastApiAvailable

    // If SDK already loaded, initialise immediately.
    if (wnd.cast?.framework && wnd.chrome?.cast) {
      initialise()
    }

    return () => {
      cancelled = true
      removeListeners?.()

      if (wnd.__onGCastApiAvailable === onCastApiAvailable) {
        wnd.__onGCastApiAvailable = existing
      }
    }
  }, [])

  const handleChromecast = async () => {
    const wnd = castWindow()
    const framework = wnd.cast?.framework
    const chrome = wnd.chrome

    if (!framework || !chrome?.cast) {
      toast.error(
        "Cast isn't available. Make sure you're using Chrome with a Chromecast on the same network."
      )

      return
    }

    try {
      const context = framework.CastContext.getInstance()

      await context.requestSession()

      const session = context.getCurrentSession()

      if (!session) {
        return
      }

      const currentTime = player?.currentTime() ?? 0
      const absoluteStream = absoluteUrl(streamUrl)
      const mediaInfo = new chrome.cast.media.MediaInfo(
        absoluteStream,
        'video/mp4'
      ) as { metadata?: { title: string } }

      mediaInfo.metadata = { title }

      const request = new chrome.cast.media.LoadRequest(mediaInfo)

      request.currentTime = currentTime

      await session.loadMedia(request)

      player?.pause()
    } catch (error) {
      console.warn('Cast session failed:', error)
      toast.error(
        "Chromecast couldn't reach Jukebox. Make sure your device is on the same network."
      )
    }
  }

  const handleClick = () => {
    if (chromecastAvailable) {
      // When both are available, prefer the Chromecast picker; Safari will
      // still show its own AirPlay glyph natively inside the <video> element.
      void handleChromecast()

      return
    }

    if (airplayAvailable) {
      showAirplayPicker()
    }
  }

  if (!airplayAvailable && !chromecastAvailable) {
    return null
  }

  return (
    <button
      aria-label={isCasting ? 'Stop casting' : 'Cast'}
      className="p-2 flex justify-center items-center cursor-pointer"
      onClick={handleClick}
      type="button"
    >
      <Cast
        className={`size-7 hover:scale-125 ${isCasting ? 'text-blue-400' : 'text-white'}`}
      />
    </button>
  )
}
