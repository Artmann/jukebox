export interface ParsedFilename {
  title: string
  year: number | null
}

export type SubtitleFormat = 'ass' | 'srt' | 'vtt'

export interface ParsedSubtitleFilename {
  baseName: string
  format: SubtitleFormat
  language: string
}

const subtitleExtensions: Record<string, SubtitleFormat> = {
  '.ass': 'ass',
  '.srt': 'srt',
  '.vtt': 'vtt'
}

// ISO-639-2 → ISO-639-1 for the languages we expect to encounter most often.
// Anything outside this map falls back to the raw 2-letter code (or 'und').
const threeLetterToTwoLetter: Record<string, string> = {
  ara: 'ar',
  ces: 'cs',
  cze: 'cs',
  dan: 'da',
  deu: 'de',
  dut: 'nl',
  ell: 'el',
  eng: 'en',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  ger: 'de',
  gre: 'el',
  heb: 'he',
  hin: 'hi',
  hun: 'hu',
  ind: 'id',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  nld: 'nl',
  nor: 'no',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rum: 'ro',
  rus: 'ru',
  spa: 'es',
  swe: 'sv',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  vie: 'vi',
  zho: 'zh',
  chi: 'zh'
}

// Full language name → ISO-639-1 for the languages most likely written out.
const fullNameToCode: Record<string, string> = {
  arabic: 'ar',
  chinese: 'zh',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  finnish: 'fi',
  french: 'fr',
  german: 'de',
  greek: 'el',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  norwegian: 'no',
  polish: 'pl',
  portuguese: 'pt',
  romanian: 'ro',
  russian: 'ru',
  spanish: 'es',
  swedish: 'sv',
  thai: 'th',
  turkish: 'tr',
  ukrainian: 'uk',
  vietnamese: 'vi'
}

// Tokens we drop from the language slot when present (e.g. "Movie.en.forced.srt").
// 'hi' is intentionally absent — it collides with the Hindi language code.
const subtitleModifiers = new Set([
  'cc',
  'forced',
  'hoh',
  'sdh'
])

/**
 * Parse a movie filename to extract title and year.
 * The year marks the boundary between the title and technical info.
 *
 * Examples:
 * - Jurassic.Park.1993.720p.BrRip.264.YIFY.mp4 -> { title: "Jurassic Park", year: 1993 }
 * - The.Social.Network.(2010).1080p.BrRip.x264.mp4 -> { title: "The Social Network", year: 2010 }
 */
export function parseFilename(fileName: string): ParsedFilename {
  // Remove file extension
  const name = fileName.replace(/\.[^.]+$/, '')

  // Try to find year in parentheses/brackets first: (2010), [2010]
  const bracketYearMatch = name.match(/[([]((?:19|20)\d{2})[)\]]/)
  if (bracketYearMatch?.[1]) {
    const year = parseInt(bracketYearMatch[1], 10)
    const yearIndex = bracketYearMatch.index ?? 0
    let title = name.substring(0, yearIndex)

    // Replace separators with spaces and clean up
    title = title.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
    // Remove trailing dashes or hyphens
    title = title.replace(/[-–—]+$/, '').trim()

    return { title, year }
  }

  // Find standalone year (19xx or 20xx) that's likely the release year
  // Look for year followed by resolution, codec, or other technical indicators
  const yearPattern = /[.\s]((?:19|20)\d{2})[.\s]/g
  let match: RegExpExecArray | null
  let bestMatch: { year: number; index: number } | null = null

  while ((match = yearPattern.exec(name)) !== null) {
    const yearStr = match[1]
    if (!yearStr) continue
    const year = parseInt(yearStr, 10)
    // Check what comes after the year - if it looks like technical info, this is likely the release year
    const afterYear = name.substring(match.index + match[0].length)
    const looksLikeTechInfo =
      /^(720p|1080p|2160p|4K|BluRay|BrRip|BDRip|WEB|HDTV|DVDRip|x264|x265|H\.?264)/i.test(
        afterYear
      )

    if (looksLikeTechInfo || !bestMatch) {
      bestMatch = { year, index: match.index }
      if (looksLikeTechInfo) break // Found a confident match
    }
  }

  if (bestMatch) {
    let title = name.substring(0, bestMatch.index)
    title = title.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
    title = title.replace(/[-–—]+$/, '').trim()
    return { title, year: bestMatch.year }
  }

  // No year found - just clean up the whole name
  const title = name.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()

  return { title, year: null }
}

/**
 * Extract year from a filename if present
 */
export function extractYear(fileName: string): number | null {
  return parseFilename(fileName).year
}

/**
 * Clean a movie filename to extract a readable title
 */
export function cleanTitle(fileName: string): string {
  return parseFilename(fileName).title
}

function normalizeLanguageToken(rawToken: string): string | null {
  const token = rawToken.toLowerCase()

  if (subtitleModifiers.has(token)) {
    return null
  }

  if (fullNameToCode[token]) {
    return fullNameToCode[token]
  }

  if (threeLetterToTwoLetter[token]) {
    return threeLetterToTwoLetter[token]
  }

  // 2-letter ISO-639-1 codes — lowercase a-z, exactly two chars.
  if (/^[a-z]{2}$/.test(token)) {
    return token
  }

  // 3-letter codes we don't know about — keep them so the user still sees
  // *something* sensible rather than collapsing to "und".
  if (/^[a-z]{3}$/.test(token)) {
    return token
  }

  return null
}

/**
 * Parse a sidecar subtitle filename. Returns the base name (the video filename
 * without the language suffix or extension), the detected language as a
 * lowercase code (ISO-639-1 when known, otherwise the raw token, or 'und' when
 * the filename has no language hint), and the subtitle format.
 *
 * Returns null when the file isn't a recognized subtitle format.
 *
 * Supported patterns:
 * - Movie.srt                      → language 'und'
 * - Movie.en.srt / Movie.eng.srt   → 'en'
 * - Movie.English.srt              → 'en'
 * - Movie.en.forced.srt            → 'en' (forced/sdh/cc/hoh modifiers ignored)
 * - Show.S01E02.en.srt             → baseName 'Show.S01E02', language 'en'
 */
export function parseSubtitleFilename(
  fileName: string
): ParsedSubtitleFilename | null {
  const lastDot = fileName.lastIndexOf('.')

  if (lastDot < 0) {
    return null
  }

  const extension = fileName.substring(lastDot).toLowerCase()
  const format = subtitleExtensions[extension]

  if (!format) {
    return null
  }

  const stem = fileName.substring(0, lastDot)

  // Walk trailing dot-separated tokens, peeling off modifiers (forced/sdh/...)
  // and stopping when we find something that looks like a language code.
  const tokens = stem.split('.')
  let language = 'und'
  let baseEndIndex = tokens.length

  for (let cursor = tokens.length - 1; cursor >= 1; cursor--) {
    const token = tokens[cursor]

    if (!token) {
      continue
    }

    const lowered = token.toLowerCase()

    if (subtitleModifiers.has(lowered)) {
      // Skip the modifier and keep walking left looking for the language.
      baseEndIndex = cursor
      continue
    }

    const normalized = normalizeLanguageToken(token)

    if (normalized) {
      language = normalized
      baseEndIndex = cursor
    }

    break
  }

  const baseName = tokens.slice(0, baseEndIndex).join('.')

  return { baseName, format, language }
}
