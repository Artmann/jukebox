import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'

import {
  castWindow,
  readInitialCastingState,
  type RemotePlayerControllerLike,
  type RemotePlayerLike
} from '../lib/chromecast'

interface ChromecastConnectionOptions {
  onRemoteDisconnected: (remoteCurrentTime: number) => void
  onRemoteTimeChanged: (currentTime: number, duration: number) => void
}

interface ChromecastConnectionResult {
  chromecastAvailable: boolean
  isCasting: boolean
}

/**
 * Waits for the Chromecast SDK, wires up the remote player listeners, and
 * tracks whether casting is available and active. `onRemoteDisconnected`
 * fires when a cast session ends with the remote position to resume from;
 * `onRemoteTimeChanged` reports the remote position while casting.
 */
export function useChromecastConnection({
  onRemoteDisconnected,
  onRemoteTimeChanged
}: ChromecastConnectionOptions): ChromecastConnectionResult {
  // If the Cast SDK is already on the page the button can render right away;
  // otherwise the SDK's ready callback flips this on once it loads.
  const [chromecastAvailable, setChromecastAvailable] = useState(() => {
    const wnd = castWindow()

    return Boolean(wnd.cast?.framework && wnd.chrome?.cast)
  })
  const castingListenersRef = useRef<Set<() => void> | null>(null)
  const controllerRef = useRef<RemotePlayerControllerLike | null>(null)
  const remoteRef = useRef<RemotePlayerLike | null>(null)

  const getCastingListeners = () => {
    return (castingListenersRef.current ??= new Set())
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

    if (!remote.isConnected && remote.currentTime > 0) {
      onRemoteDisconnected(remote.currentTime)
    }
  })

  const handleRemoteTimeChange = useEffectEvent((remote: RemotePlayerLike) => {
    if (!remote.isConnected) {
      return
    }

    onRemoteTimeChanged(remote.currentTime, remote.duration)
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

  return { chromecastAvailable, isCasting }
}
