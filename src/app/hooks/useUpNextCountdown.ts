import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

import type { Episode, Show } from '../lib/media'

const upNextThresholdSeconds = 45

interface UpNextCountdownOptions {
  episodeId: number | undefined
  episodeShow: Show | undefined
  isEpisode: boolean
  nextEpisode: Episode | null
  player: Player | null
}

interface UpNextCountdownResult {
  dismiss: () => void
  isCountingDown: boolean
  upNextVisible: boolean
}

interface UpNextState {
  countingDown: boolean
  // The episode the overlay state belongs to. When the viewer moves to a
  // different episode, state for the old one is simply ignored — no reset
  // effect needed.
  forEpisodeId: number | undefined
  visible: boolean
}

const hiddenUpNextState: UpNextState = {
  countingDown: false,
  forEpisodeId: undefined,
  visible: false
}

/**
 * Reveals the "Up next" overlay near the end of an episode and drives the
 * countdown state based on the time threshold or the `ended` event —
 * whichever fires first. When the show is out of episodes, `ended` navigates
 * back to the show page instead.
 */
export function useUpNextCountdown({
  episodeId,
  episodeShow,
  isEpisode,
  nextEpisode,
  player
}: UpNextCountdownOptions): UpNextCountdownResult {
  const navigate = useNavigate()
  const [upNextState, setUpNextState] = useState<UpNextState>(hiddenUpNextState)
  const dismissedEpisodeIdRef = useRef<number | undefined>(undefined)

  const isCurrentEpisodeState = upNextState.forEpisodeId === episodeId

  const revealCountdown = () => {
    setUpNextState((previous) => {
      if (
        previous.forEpisodeId === episodeId &&
        previous.visible &&
        previous.countingDown
      ) {
        return previous
      }

      return { countingDown: true, forEpisodeId: episodeId, visible: true }
    })
  }

  const handleTimeUpdate = useEffectEvent(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const currentTime = player.currentTime() ?? 0
    const duration = player.duration() ?? 0

    if (duration <= 0) {
      return
    }

    const remaining = duration - currentTime
    const isDismissed = dismissedEpisodeIdRef.current === episodeId

    if (remaining <= upNextThresholdSeconds && !isDismissed && nextEpisode) {
      revealCountdown()
    }
  })

  const handleEnded = useEffectEvent(() => {
    if (!nextEpisode) {
      toast("You've finished all episodes.")

      if (episodeShow) {
        void navigate(`/shows/${episodeShow.id}`)
      }

      return
    }

    if (dismissedEpisodeIdRef.current === episodeId) {
      return
    }

    revealCountdown()
  })

  useEffect(() => {
    if (!player || player.isDisposed() || !isEpisode) {
      return
    }

    const onTimeUpdate = () => handleTimeUpdate()
    const onEnded = () => handleEnded()

    player.on('timeupdate', onTimeUpdate)
    player.on('ended', onEnded)

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('timeupdate', onTimeUpdate)
      player.off('ended', onEnded)
    }
  }, [player, isEpisode])

  const dismiss = () => {
    dismissedEpisodeIdRef.current = episodeId
    setUpNextState(hiddenUpNextState)
  }

  return {
    dismiss,
    isCountingDown: isCurrentEpisodeState && upNextState.countingDown,
    upNextVisible: isCurrentEpisodeState && upNextState.visible
  }
}
