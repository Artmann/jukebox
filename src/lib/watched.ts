/**
 * Shared "watched" threshold used across the server and client.
 *
 * An episode (or movie) is considered complete once the profile has
 * progressed at least this fraction of the total duration. Kept in a single
 * module so server endpoints ("Up Next", next-episode) and client overlays
 * ("Up Next" countdown) can't drift.
 */
export const watchedThreshold = 0.9
