import { Cast } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

interface CastButtonProps {
  episodeId?: number
  movieId?: number
  player: Player | null
  streamUrl: string
  title: string
}

interface CastGlobals {
  airplayAvailable: boolean
  chromecastAvailable: boolean
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

export function CastButton({
  episodeId,
  movieId,
  player,
  streamUrl,
  title
}: CastButtonProps) {
  const [availability, setAvailability] = useState<CastGlobals>({
    airplayAvailable: false,
    chromecastAvailable: false
  })
  const [isCasting, setIsCasting] = useState(false)
  const remoteRef = useRef<RemotePlayerLike | null>(null)
  const controllerRef = useRef<RemotePlayerControllerLike | null>(null)

  // Detect AirPlay availability (Safari only).
  useEffect(() => {
    const video = document.querySelector('video') as
      | (HTMLVideoElement & {
          webkitShowPlaybackTargetPicker?: () => void
        })
      | null

    const hasAirplay =
      typeof video?.webkitShowPlaybackTargetPicker === 'function'

    setAvailability((previous) => ({
      ...previous,
      airplayAvailable: hasAirplay
    }))
  }, [player])

  // Detect Chromecast availability by waiting for the SDK.
  useEffect(() => {
    let cancelled = false

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
        const remote = new framework.RemotePlayer()
        const controller = new framework.RemotePlayerController(remote)

        remoteRef.current = remote
        controllerRef.current = controller

        const onConnectedChange = () => {
          setIsCasting(remote.isConnected)

          if (player && !remote.isConnected && remote.currentTime > 0) {
            // Resume locally from the remote position.
            player.currentTime(remote.currentTime)
            void player.play()
          }
        }

        const onTimeChange = () => {
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

          void fetch(progressUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentTime: remote.currentTime,
              duration: remote.duration
            })
          }).catch(() => {
            // Best-effort progress save; ignore failures.
          })
        }

        controller.addEventListener(
          framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
          onConnectedChange
        )
        controller.addEventListener(
          framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
          onTimeChange
        )

        // Best-effort: mark availability. If the user has a Chromecast on LAN,
        // requestSession will show the picker; if not, it will error cleanly.
        setAvailability((previous) => ({
          ...previous,
          chromecastAvailable: true
        }))
        void context
      } catch (error) {
        console.warn('Cast framework initialisation failed:', error)
      }
    }

    // The Cast SDK calls __onGCastApiAvailable when ready.
    const wnd = castWindow()
    const existing = wnd.__onGCastApiAvailable

    wnd.__onGCastApiAvailable = (isAvailable: boolean) => {
      existing?.(isAvailable)

      if (isAvailable) {
        initialise()
      }
    }

    // If SDK already loaded, initialise immediately.
    if (wnd.cast?.framework && wnd.chrome?.cast) {
      initialise()
    }

    return () => {
      cancelled = true

      const controller = controllerRef.current
      const framework = castWindow().cast?.framework

      if (controller && framework) {
        // No specific handlers to remove — controller is re-created per mount.
      }
    }
  }, [player, episodeId, movieId])

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

  const handleAirplay = () => {
    const video = document.querySelector('video') as
      | (HTMLVideoElement & {
          webkitShowPlaybackTargetPicker?: () => void
        })
      | null

    if (video?.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker()
    }
  }

  const handleClick = () => {
    if (availability.airplayAvailable && availability.chromecastAvailable) {
      // Both available — prefer Chromecast picker; Safari will still show
      // its own AirPlay glyph natively inside the <video> element.
      void handleChromecast()

      return
    }

    if (availability.chromecastAvailable) {
      void handleChromecast()

      return
    }

    if (availability.airplayAvailable) {
      handleAirplay()
    }
  }

  if (!availability.airplayAvailable && !availability.chromecastAvailable) {
    return null
  }

  return (
    <button
      aria-label={isCasting ? 'Stop casting' : 'Cast'}
      className="p-2 flex justify-center items-center cursor-pointer"
      onClick={handleClick}
    >
      <Cast
        className={`size-7 hover:scale-125 ${isCasting ? 'text-blue-400' : 'text-white'}`}
      />
    </button>
  )
}
