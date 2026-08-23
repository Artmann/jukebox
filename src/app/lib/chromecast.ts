export interface CastContextLike {
  getCurrentSession: () => CastSessionLike | null
  requestSession: () => Promise<void>
}

export interface CastSessionLike {
  loadMedia: (request: unknown) => Promise<void>
}

export interface ChromeCastWindow {
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

export interface RemotePlayerControllerLike {
  addEventListener: (event: string, handler: () => void) => void
  removeEventListener: (event: string, handler: () => void) => void
}

export interface RemotePlayerLike {
  currentTime: number
  duration: number
  isConnected: boolean
}

export const castWindow = (): ChromeCastWindow =>
  window as unknown as ChromeCastWindow

export function readInitialCastingState(): boolean {
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
