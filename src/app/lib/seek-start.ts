import { Logger } from './logger'

const logger = new Logger('seek-start')

/**
 * Where a seek to `targetSeconds` will actually start. Stream-copied video
 * can only begin at a keyframe, so the server snaps the target to the
 * keyframe at-or-before it — using the answer as the session's timeline
 * offset keeps absolute time exact instead of up to one GOP off.
 *
 * Falls back to `targetSeconds` when the lookup fails: the restarted session
 * still plays from the nearest keyframe, the timeline is just slightly
 * approximate — better than refusing the seek.
 */
export async function fetchSeekStart(
  fileId: string,
  targetSeconds: number
): Promise<number> {
  const target = Math.max(0, Number(targetSeconds.toFixed(3)))

  try {
    const response = await fetch(`/api/transcode/${fileId}/seek/${target}`)

    if (!response.ok) {
      logger.warn('seek-start lookup failed with status', response.status)

      return target
    }

    const body: unknown = await response.json()
    const startSeconds =
      typeof body === 'object' &&
      body !== null &&
      'startSeconds' in body &&
      typeof body.startSeconds === 'number' &&
      Number.isFinite(body.startSeconds) &&
      body.startSeconds >= 0
        ? body.startSeconds
        : null

    if (startSeconds === null) {
      logger.warn('seek-start lookup returned an unexpected payload')

      return target
    }

    return startSeconds
  } catch (error) {
    logger.warn('seek-start lookup failed', error)

    return target
  }
}
