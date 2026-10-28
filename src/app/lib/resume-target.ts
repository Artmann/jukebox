import { watchedThreshold } from '../../lib/watched'
import type { Episode, SeasonWithEpisodes } from './media'

export interface EpisodeProgress {
  currentTime: number
  duration: number | null
  updatedAt?: string
}

export type EpisodeProgressMap = Record<number, EpisodeProgress>

// 'resume': an episode is partway through. 'next': the viewer has watched
// something and this is the episode to continue with. 'start': nothing has
// been watched yet, or the whole show is done and it starts over.
export type ResumeKind = 'next' | 'resume' | 'start'

export interface ResumeTarget {
  episode: Episode
  kind: ResumeKind
  progress: EpisodeProgress | null
}

export function episodeCode(episode: Episode): string {
  return `S${episode.seasonNumber} E${episode.episodeNumber}`
}

export function formatRuntime(minutes: number | null): string {
  if (minutes === null) {
    return ''
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function isInProgress(progress: EpisodeProgress | undefined): boolean {
  if (!progress?.duration || progress.currentTime <= 0) {
    return false
  }

  return !isWatched(progress)
}

export function isWatched(progress: EpisodeProgress | undefined): boolean {
  if (!progress?.duration) {
    return false
  }

  return progress.currentTime >= progress.duration * watchedThreshold
}

export function progressPercent(progress: EpisodeProgress | undefined): number {
  if (!progress?.duration) {
    return 0
  }

  return Math.min((progress.currentTime / progress.duration) * 100, 100)
}

/**
 * Picks the episode a show page should feature and play:
 *
 * 1. If the most recently touched episode is partway through, resume it.
 * 2. If it was finished, the first unwatched episode after it.
 * 3. Otherwise the most recently touched in-progress episode.
 * 4. Otherwise the first unwatched episode, then the very first episode.
 *
 * Specials (season 0) come after the regular seasons, so a fresh show starts
 * at Season 1 rather than at the specials.
 */
export function findResumeTarget(
  seasons: ReadonlyArray<SeasonWithEpisodes>,
  progressMap: EpisodeProgressMap | undefined
): ResumeTarget | null {
  const episodes = [
    ...seasons.filter((season) => season.seasonNumber > 0),
    ...seasons.filter((season) => season.seasonNumber === 0)
  ].flatMap((season) => season.episodes)

  const firstEpisode = episodes[0]

  if (!firstEpisode) {
    return null
  }

  const progressFor = (episode: Episode): EpisodeProgress | undefined =>
    progressMap?.[episode.id]

  const startedEpisodes = episodes
    .map((episode, index) => ({
      episode,
      index,
      progress: progressFor(episode)
    }))
    .filter(
      (
        entry
      ): entry is {
        episode: Episode
        index: number
        progress: EpisodeProgress
      } => entry.progress !== undefined && entry.progress.currentTime > 0
    )
    .toSorted((a, b) =>
      (b.progress.updatedAt ?? '').localeCompare(a.progress.updatedAt ?? '')
    )

  const latest = startedEpisodes[0]

  if (latest && isInProgress(latest.progress)) {
    return {
      episode: latest.episode,
      kind: 'resume',
      progress: latest.progress
    }
  }

  if (latest && isWatched(latest.progress)) {
    // Finishing a regular episode continues the regular run; the specials
    // that follow the finale in this ordering aren't its next episode.
    const finishedSpecial = latest.episode.seasonNumber === 0
    const nextEpisode = episodes
      .slice(latest.index + 1)
      .find(
        (episode) =>
          (finishedSpecial || episode.seasonNumber > 0) &&
          !isWatched(progressFor(episode))
      )

    if (nextEpisode) {
      return {
        episode: nextEpisode,
        kind: isInProgress(progressFor(nextEpisode)) ? 'resume' : 'next',
        progress: progressFor(nextEpisode) ?? null
      }
    }
  }

  const inProgress = startedEpisodes.find((entry) =>
    isInProgress(entry.progress)
  )

  if (inProgress) {
    return {
      episode: inProgress.episode,
      kind: 'resume',
      progress: inProgress.progress
    }
  }

  const anyWatched = startedEpisodes.some((entry) => isWatched(entry.progress))
  const firstUnwatched = episodes.find(
    (episode) => !isWatched(progressFor(episode))
  )

  if (firstUnwatched && anyWatched) {
    return {
      episode: firstUnwatched,
      kind: 'next',
      progress: progressFor(firstUnwatched) ?? null
    }
  }

  const startEpisode = firstUnwatched ?? firstEpisode

  return {
    episode: startEpisode,
    kind: 'start',
    progress: progressFor(startEpisode) ?? null
  }
}
