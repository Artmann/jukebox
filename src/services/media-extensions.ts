import { extname } from 'path'

// Single source of truth for file-extension classification. Scanner walks,
// show-scanner walks, and subtitle discovery all share these sets so we can't
// drift (e.g. add .webm to one and forget the other). Keep the lowercase
// leading-dot form — callers lowercase the extension before lookup.

export const videoExtensions = new Set([
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

export const subtitleExtensions = new Set(['.ass', '.srt', '.vtt'])

export function isVideoFile(filePath: string): boolean {
  return videoExtensions.has(extname(filePath).toLowerCase())
}

export function isSubtitleFile(filePath: string): boolean {
  return subtitleExtensions.has(extname(filePath).toLowerCase())
}
