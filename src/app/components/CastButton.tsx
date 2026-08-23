import { Cast } from 'lucide-react'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

import { useChromecastConnection } from '../hooks/useChromecastConnection'
import { useSaveProgress } from '../hooks/useSaveProgress'
import { castWindow } from '../lib/chromecast'
import type { PlaybackTimeline } from '../lib/playback-timeline'

interface CastButtonProps {
  episodeId?: number
  movieId?: number
  player: Player | null
  streamUrl: string
  timeline: PlaybackTimeline
  title: string
}

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
  timeline,
  title
}: CastButtonProps) {
  const { mutate: saveProgress } = useSaveProgress()

  const { chromecastAvailable, isCasting } = useChromecastConnection({
    onRemoteDisconnected: (remoteCurrentTime) => {
      if (!player) {
        return
      }

      // Resume locally from the remote position. The cast device plays the
      // whole file, so its position is an absolute one — going through the
      // timeline is what restarts a transcode when it lands past the head.
      timeline.seek(remoteCurrentTime)
      void player.play()
    },
    onRemoteTimeChanged: (currentTime, duration) => {
      const progressUrl = episodeId
        ? `/api/progress/episode/${episodeId}`
        : movieId
          ? `/api/progress/${movieId}`
          : null

      if (!progressUrl) {
        return
      }

      // Best-effort progress save; failures stay in the mutation state.
      saveProgress({ currentTime, duration, progressUrl })
    }
  })

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

      // Casting always sends the whole file, so it starts from the viewer's
      // absolute position, not the current transcode session's.
      const currentTime = timeline.currentTime()
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
