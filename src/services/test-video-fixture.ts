import { spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import invariant from 'tiny-invariant'

/**
 * A tiny deterministic test video: 12 seconds of testsrc2 at 24 fps with a
 * fixed 2-second GOP (keyframes at exactly 0, 2, 4, ...) and a sine audio
 * track. The fixed GOP is what makes keyframe-snapping assertions exact.
 *
 * The file lands in a fresh temp directory; callers remove that directory
 * when they are done with it.
 */
export function createVideoFixture(): {
  directory: string
  filePath: string
} {
  const directory = mkdtempSync(path.join(tmpdir(), 'jukebox-video-fixture-'))
  const filePath = path.join(directory, 'fixture.mp4')

  const result = spawnSync(
    'ffmpeg',
    [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=duration=12:size=320x180:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=12',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-g',
      '48',
      '-keyint_min',
      '48',
      '-sc_threshold',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-y',
      filePath
    ],
    { encoding: 'utf8' }
  )

  invariant(
    result.status === 0,
    `ffmpeg could not generate the test fixture: ${result.stderr ?? result.error}`
  )

  return { directory, filePath }
}
