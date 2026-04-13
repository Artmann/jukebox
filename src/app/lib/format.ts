/**
 * Format seconds into a time string.
 * Shows hours only when needed: "01:23:45" or "23:45".
 */
export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = hrs > 0 ? [hrs, mins, secs] : [mins, secs]

  return parts.map((v) => v.toString().padStart(2, '0')).join(':')
}
