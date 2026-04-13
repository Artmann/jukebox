import { extname } from 'path'

const videoExtensions = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.m4v',
  '.webm',
  '.flv',
  '.mpeg',
  '.mpg'
])

const episodePattern = /S(\d+)[Ee](\d+)/

const technicalPatterns =
  /\b(720p|1080p|2160p|4K|BluRay|BrRip|BDRip|WEB|WEB-DL|HDTV|DVDRip|x264|x265|H\.?264|HEVC|AAC|AC3|DD5|10bit)\b/i

export interface ParsedEpisode {
  seasonNumber: number
  episodeNumber: number
  title: string | null
}

export function parseEpisodeFilename(fileName: string): ParsedEpisode | null {
  const ext = extname(fileName).toLowerCase()

  if (!videoExtensions.has(ext)) {
    return null
  }

  const name = fileName.replace(/\.[^.]+$/, '')
  const match = name.match(episodePattern)

  if (!match?.[1] || !match[2]) {
    return null
  }

  // Reject extras like S01EX1
  const fullMatch = name.match(/S\d+EX\d+/i)
  if (fullMatch) {
    return null
  }

  const seasonNumber = parseInt(match[1], 10)
  const episodeNumber = parseInt(match[2], 10)

  // Extract title: everything after the SxxExx pattern
  const matchIndex = match.index ?? 0
  const afterPattern = name.substring(matchIndex + match[0].length)
  let title = afterPattern.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()

  // Strip technical info from the end
  const techMatch = title.search(technicalPatterns)
  if (techMatch > 0) {
    title = title.substring(0, techMatch).trim()
  }

  // Remove trailing dashes
  title = title.replace(/[-–—]+$/, '').trim()

  return {
    seasonNumber,
    episodeNumber,
    title: title || null
  }
}
