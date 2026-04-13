# TV Show Support

## Context

Jukebox currently indexes and plays movies from a local library folder. Users
also have TV shows organized in a separate folder (`D:\Downloads\TV Shows`) with
varying structures — some with season subfolders, some flat with `SxxExx`
naming, and some split across multiple top-level folders per season. This spec
adds first-class TV show support: indexing, browsing, and playback with an
episode browser.

## Goals

- Index TV shows and episodes from a configurable library path.
- Enrich shows with TMDB metadata (artwork, episode titles, overviews).
- Display shows alongside movies on the home page in mixed genre rows.
- Add a `/shows` page for browsing shows by genre.
- Add a `/shows/:id` detail page for browsing seasons and episodes.
- Update the player with a side-panel episode browser for show playback.

## Database Schema

Three new Drizzle tables alongside existing `movies` and `watchProgress`.

### `shows`

| Column       | Type    | Notes                         |
| ------------ | ------- | ----------------------------- |
| id           | integer | PK, auto-increment            |
| title        | text    | Show name                     |
| folderPath   | text    | Unique — normalized root path |
| tmdbId       | integer | Nullable                      |
| year         | integer | Nullable — first air year     |
| overview     | text    | Nullable                      |
| genres       | text    | Nullable — JSON string array  |
| rating       | real    | Nullable                      |
| posterPath   | text    | Nullable — TMDB poster path   |
| backdropPath | text    | Nullable — TMDB backdrop path |
| createdAt    | integer | Unix timestamp                |
| updatedAt    | integer | Unix timestamp                |

### `seasons`

| Column       | Type    | Notes                       |
| ------------ | ------- | --------------------------- |
| id           | integer | PK, auto-increment          |
| showId       | integer | FK → shows.id               |
| seasonNumber | integer |                             |
| name         | text    | Nullable — TMDB season name |
| overview     | text    | Nullable                    |
| posterPath   | text    | Nullable                    |
| episodeCount | integer | Nullable — from TMDB        |
| Unique       |         | (showId, seasonNumber)      |

### `episodes`

| Column        | Type    | Notes                             |
| ------------- | ------- | --------------------------------- |
| id            | integer | PK, auto-increment                |
| showId        | integer | FK → shows.id                     |
| seasonId      | integer | FK → seasons.id                   |
| seasonNumber  | integer | Denormalized for convenience      |
| episodeNumber | integer | Parsed from SxxExx                |
| title         | text    | From TMDB or parsed from filename |
| filePath      | text    | Unique — absolute path to file    |
| fileName      | text    |                                   |
| fileSize      | integer | Nullable                          |
| extension     | text    | Nullable                          |
| tmdbId        | integer | Nullable                          |
| overview      | text    | Nullable                          |
| runtime       | integer | Nullable — minutes                |
| stillPath     | text    | Nullable — TMDB episode still     |
| createdAt     | integer | Unix timestamp                    |
| updatedAt     | integer | Unix timestamp                    |

### `watchProgress` extension

Add a nullable `episodeId` column (FK → episodes.id) alongside the existing
nullable `movieId`. One of the two must be set. No other structural changes.

## Show Scanner

New `showScanner` service parallel to the existing `scanner.ts`.

### Show name normalization

To group folders like "First Wave 1998 Season 1" and "First Wave 1998 Season 2"
into one show:

1. Strip patterns: `Season N`, `S01-S08`, `S01`, `Complete`, quality tags
   (`720p`, `1080p`, `BluRay`, `x264`, `x265`, `HEVC`), codec info, group tags
   in `[]` and `()` that contain technical info.
2. Capture and strip year (used for TMDB lookup).
3. Normalize separators (dots, underscores → spaces), collapse whitespace, trim.
4. Result is the base show name used for grouping.

### Scan flow

1. List top-level entries in the shows library path.
2. Normalize each folder name → group folders sharing the same base name.
3. For each show group, walk subfolders looking for:
   - **Season folders**: match `Season N`, `S01`, or folders containing `SxxExx`
     files.
   - **Flat episodes**: `SxxExx` pattern directly in the show folder.
4. Parse episode files with regex `S(\d+)[Ee](\d+)` for season/episode numbers.
5. Skip non-episode content: extras (`S01EX1`), images, text files,
   `Featurettes/`.
6. Fetch TMDB metadata:
   - Show level: `/search/tv` → `/tv/{id}` for genres, overview, poster,
     backdrop.
   - Season level: `/tv/{id}/season/{n}` for episode titles, overviews, stills,
     runtimes.
7. Match scanned episodes to TMDB episodes by season/episode number to get
   titles and metadata.
8. Insert/update `shows`, `seasons`, `episodes` tables.

### Scan script

Extend `scan.ts` to support both media types:

```
bun run scan                                    # movies only (default path)
bun run scan --shows "D:\Downloads\TV Shows"    # shows only
bun run scan "D:\Movies" --shows "D:\TV Shows"  # both
```

## TMDB Service Extensions

New functions in the existing `tmdb.ts`:

- `searchShow(title, year?)` — `/search/tv`
- `getShowDetails(tmdbId)` — `/tv/{id}`
- `getSeasonDetails(tmdbId, seasonNumber)` — `/tv/{id}/season/{n}`
- `fetchShowMetadata(title, year?)` — orchestrator (search → details)

New types:

- `TMDBShowSearchResult` — id, name, first_air_date, overview, poster_path,
  backdrop_path, vote_average
- `TMDBShowDetails` — extends with genres, number_of_seasons
- `TMDBSeasonDetails` — season_number, name, overview, poster_path, episodes[]
- `TMDBEpisodeDetails` — episode_number, name, overview, runtime, still_path,
  air_date
- `ShowMetadata`, `SeasonMetadata`, `EpisodeMetadata` — normalized for DB
  storage

## API Routes

### New library routes

- `GET /api/library/shows` — all shows ordered by title, includes season and
  episode counts.
- `GET /api/library/shows/:id` — single show with nested seasons and episodes.
- `GET /api/library/shows/:id/seasons/:seasonNumber` — episodes for a specific
  season.

### Streaming

- `GET /api/stream/episode/:id` — stream episode file. Same range-request logic
  as the existing movie stream endpoint, different table lookup.

### Progress

- `GET /api/progress/continue-watching` — returns both movies and episodes in a
  unified list with a `type` discriminator (`'movie' | 'episode'`). Episodes
  include show title and season/episode numbers.
- `GET /api/progress/episode/:episodeId` — get episode progress.
- `PUT /api/progress/episode/:episodeId` — save episode progress.

## Frontend

### Types

```typescript
type MediaItem = ({ type: 'movie' } & Movie) | ({ type: 'show' } & Show)
```

Used in genre rows, recently added, and anywhere movies and shows appear
together.

### Hooks

- `useShows()` — fetches `/api/library/shows`, returns `Show[]`.
- `useShow(id)` — fetches `/api/library/shows/:id`, returns show with nested
  seasons/episodes.

### Routes

| Path                 | Page           | Description                         |
| -------------------- | -------------- | ----------------------------------- |
| `/`                  | HomePage       | Mixed genre rows, continue watching |
| `/movies`            | MoviesPage     | Movie-only genre rows               |
| `/shows`             | ShowsPage      | Show-only genre rows                |
| `/shows/:id`         | ShowDetailPage | Seasons + episode list              |
| `/watch/:id`         | WatchPage      | Movie playback (unchanged)          |
| `/watch/episode/:id` | WatchPage      | Episode playback (with side panel)  |

### Home page

- Merges `useMovies()` and `useShows()` into `MediaItem[]` for genre rows.
- `ContinueWatchingRow` shows both movies and in-progress episodes. Episode
  items display show name + "S2 E5" style label.
- Recently added row merges both types sorted by `createdAt`.
- Clicking a movie → `/watch/:id`. Clicking a show → `/shows/:id`.

### Shows page

Same layout as Movies page but filtered to shows only. Genre rows built from
show-level genres.

### Show detail page (`/shows/:id`)

- Hero section: backdrop, title, year, rating, overview.
- Season selector (tabs or dropdown).
- Episode list for selected season: episode number, title, runtime, overview
  snippet, still image thumbnail.
- Progress bars on started episodes.
- Click episode → `/watch/episode/:id`.

### Player updates

**Title bar**: Shows "Show Name — S1 E5 · Episode Title" for episodes.

**Episode side panel**:

- Triggered by an "Episodes" button (list icon) in video controls. Only visible
  when watching an episode.
- Slides in from the right. Video shrinks to accommodate.
- Season dropdown at top. Scrollable episode list. Current episode highlighted.
- Click episode → saves progress, swaps video source (no full page reload).
- Dismiss with X or clicking the video area.

**Auto-advance**: When an episode reaches ~95% duration, auto-play the next
episode in the season. If it's the last episode in a season, advance to the next
season's first episode.

**VideoControls changes**:

- Add "Episodes" button — only visible for episode playback.
- Accept either `movieId` or `episodeId` for progress saving.
- Title prop shows formatted episode title.

## Verification

1. **Scanner**: Run `bun run scan --shows "D:\Downloads\TV Shows"` and verify
   shows, seasons, and episodes appear in the database with correct grouping and
   TMDB metadata.
2. **API**: Hit `/api/library/shows` and `/api/library/shows/:id` and verify
   response structure.
3. **Home page**: Start dev server, verify shows appear in genre rows alongside
   movies. Verify "Continue Watching" shows both types.
4. **Shows page**: Navigate to `/shows`, verify genre rows of shows.
5. **Show detail**: Click a show, verify seasons/episodes display correctly.
6. **Player**: Play an episode, verify title bar, episode side panel, progress
   saving, and auto-advance to next episode.
7. **Edge cases**: First Wave (multi-folder grouping), Buffy (season
   subfolders + extras filtering), Silicon Valley (split across multiple folder
   naming styles).
