/**
 * Turns a YouTube watch URL into an embeddable player URL, or null when the
 * URL isn't one we know how to embed.
 */
export function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  const match = url.match(/[?&]v=([^&]+)/)

  if (!match?.[1]) {
    return null
  }

  return `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0&controls=0&modestbranding=1`
}
