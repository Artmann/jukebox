import { readdir } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'

import {
  parseSubtitleFilename,
  type SubtitleFormat
} from './filename-parser'
import { isSubtitleFile } from './media-extensions'

export type { SubtitleFormat } from './filename-parser'

export interface DiscoveredSubtitle {
  filePath: string
  format: SubtitleFormat
  language: string
}

const languageNames: Record<string, string> = {
  ar: 'Arabic',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese'
}

/**
 * Map a language code to a human-readable label. Returns "Unknown" for the
 * undetermined sentinel and the raw code for languages not in our table.
 */
export function languageDisplayName(code: string): string {
  if (code === 'und') {
    return 'Unknown'
  }

  return languageNames[code] ?? code
}

function stripVideoExtension(fileName: string): string {
  const extension = extname(fileName)

  if (!extension) {
    return fileName
  }

  return fileName.substring(0, fileName.length - extension.length)
}

/**
 * Read the directory once and return only the entries that look like subtitle
 * files. Used by the scanner so the directory walk stays a single read per
 * folder even when subtitle discovery happens for every video.
 */
export async function readSubtitleSiblings(
  directory: string
): Promise<string[]> {
  let entries: string[]

  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  return entries.filter((entry) => isSubtitleFile(entry))
}

/**
 * Match sidecar subtitles to a video file. Siblings must already be filtered
 * to subtitle entries (see `readSubtitleSiblings`). A subtitle matches when
 * its base name (after stripping language suffix and modifiers) equals the
 * video filename without extension.
 *
 * Results are returned in stable order (by file path) so callers can compare
 * against existing rows without spurious diffs.
 */
export function discoverSubtitlesForVideo(
  videoFilePath: string,
  siblingSubtitleFiles: string[]
): DiscoveredSubtitle[] {
  const directory = dirname(videoFilePath)
  const videoStem = stripVideoExtension(basename(videoFilePath))
  const matches: DiscoveredSubtitle[] = []

  for (const sibling of siblingSubtitleFiles) {
    const parsed = parseSubtitleFilename(sibling)

    if (!parsed) {
      continue
    }

    if (parsed.baseName !== videoStem) {
      continue
    }

    matches.push({
      filePath: join(directory, sibling),
      format: parsed.format,
      language: parsed.language
    })
  }

  matches.sort((a, b) => a.filePath.localeCompare(b.filePath))

  return matches
}

/**
 * Convert SubRip (.srt) text into WebVTT (.vtt) text. Browsers don't natively
 * support .srt, so the streaming endpoint converts on the fly.
 *
 * Handles UTF-8 BOM, CRLF line endings, and the comma-vs-period decimal in
 * timestamps. Cue identifiers are preserved (they're optional in WebVTT but
 * harmless when present).
 */
export function convertSrtToVtt(srt: string): string {
  let body = srt

  if (body.charCodeAt(0) === 0xfeff) {
    body = body.substring(1)
  }

  body = body.replace(/\r\n?/g, '\n')

  // Replace timestamp commas with periods. Only inside the cue timing line so
  // commas inside dialogue are preserved.
  body = body.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  )

  return `WEBVTT\n\n${body.trimStart()}`
}
