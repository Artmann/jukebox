import type Player from 'video.js/dist/types/player'

// A transcode session only ever produces output forward from the position it
// was started at, so the player's own timeline restarts at 0 no matter where in
// the file that is. `startSeconds` is what maps it back onto the file: every
// position the app shows, saves, or seeks to is an absolute file position, and
// this module is the one place that translation happens.
export interface PlaybackTimeline {
  // Absolute position in the file, in seconds.
  currentTime(): number
  // Absolute length of the file, in seconds.
  duration(): number
  // The furthest absolute position reachable right now without restarting the
  // transcode. Equals `duration()` for direct play.
  reachableEnd(): number
  // Seeks to an absolute position in the file.
  seek(seconds: number): void
  // Absolute position the current playback session starts at.
  startSeconds(): number
}

export interface PlaybackTimelineState {
  // The probed, full-file duration. Null for direct play, where the player
  // already knows the real duration itself.
  duration: number | null
  isTranscoded: boolean
  // Restarts playback at an absolute position. Only called when the position
  // is out of reach of the running session.
  onRestart: (seconds: number) => void
  player: Player | null
  startSeconds: number
}

// Rounding slack so a seek landing a hair past the reachable end doesn't throw
// away a perfectly good session.
export const seekRestartToleranceSeconds = 2

export const seekRestartFailedMessage =
  "Couldn't jump to that position. The video is still being prepared — try again in a moment."

export type SeekAction =
  // Seconds relative to the current session — hand straight to the player.
  | { type: 'native'; seconds: number }
  // Absolute seconds — the transcode has to be restarted there.
  | { type: 'restart'; seconds: number }

export interface ResolveSeekOptions {
  isTranscoded: boolean
  reachableEnd: number
  startSeconds: number
  target: number
}

/**
 * Decides how to reach an absolute position.
 *
 * Seeking past what a live HLS playlist lists is not something the player can
 * do: VHS snaps any seek beyond `seekable` back to the live edge, and does it
 * silently. Anything outside the running session's window therefore has to
 * restart the transcode at the target instead of being handed to the player.
 */
export function resolveSeek({
  isTranscoded,
  reachableEnd,
  startSeconds,
  target
}: ResolveSeekOptions): SeekAction {
  if (!isTranscoded) {
    return { type: 'native', seconds: target }
  }

  const isWithinSession =
    target >= startSeconds &&
    target <= reachableEnd + seekRestartToleranceSeconds

  if (isWithinSession) {
    return { type: 'native', seconds: target - startSeconds }
  }

  return { type: 'restart', seconds: target }
}

/**
 * End of the player's seekable range, in the player's own timeline. For a
 * transcode still in progress this tracks the transcode head, which is a far
 * better "how far can I jump" signal than `buffered()` — that only covers the
 * handful of segments the browser has actually downloaded.
 */
export function seekableEnd(player: Player): number {
  const ranges = player.seekable() as TimeRanges | null

  if (!ranges || ranges.length === 0) {
    return 0
  }

  return ranges.end(ranges.length - 1)
}

/**
 * End of the buffered range holding `time`, in the player's own timeline.
 * Reading the last range instead would overstate buffering after a seek, when
 * an older range still sits ahead of the playhead.
 */
export function bufferedEndAt(player: Player, time: number): number {
  const ranges = player.buffered() as TimeRanges | null

  if (!ranges || ranges.length === 0) {
    return 0
  }

  for (let index = 0; index < ranges.length; index++) {
    if (time >= ranges.start(index) && time <= ranges.end(index)) {
      return ranges.end(index)
    }
  }

  return 0
}

/**
 * Builds a timeline over whatever `readState` reports at call time, so the
 * object identity stays stable while the player, source, and offset change
 * underneath it.
 */
export function createPlaybackTimeline(
  readState: () => PlaybackTimelineState
): PlaybackTimeline {
  const currentTime = (): number => {
    const { player, startSeconds } = readState()

    return startSeconds + (player?.currentTime() ?? 0)
  }

  const duration = (): number => {
    const { duration: probedDuration, player, startSeconds } = readState()

    if (probedDuration !== null) {
      return probedDuration
    }

    return startSeconds + (player?.duration() ?? 0)
  }

  const reachableEnd = (): number => {
    const { isTranscoded, player, startSeconds } = readState()

    if (!player) {
      return 0
    }

    if (!isTranscoded) {
      return duration()
    }

    return startSeconds + seekableEnd(player)
  }

  const seek = (seconds: number): void => {
    const { isTranscoded, onRestart, player, startSeconds } = readState()

    if (!player) {
      return
    }

    const total = duration()
    // A target past the end can never be transcoded, so clamp before deciding
    // — otherwise it would restart a session at an offset with no output.
    const target = Math.max(0, total > 0 ? Math.min(seconds, total) : seconds)

    const action = resolveSeek({
      isTranscoded,
      reachableEnd: reachableEnd(),
      startSeconds,
      target
    })

    if (action.type === 'restart') {
      onRestart(action.seconds)

      return
    }

    player.currentTime(action.seconds)
  }

  const startSeconds = (): number => {
    return readState().startSeconds
  }

  return { currentTime, duration, reachableEnd, seek, startSeconds }
}
