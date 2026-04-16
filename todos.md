# Jukebox — Plex Parity Todos

Jukebox is currently a single-user, LAN-only media server (React + Hono +
SQLite + TMDB) that scans a local movies/shows library and streams video to the
browser. To become a realistic Plex replacement it's missing the multi-user,
session-management, and polish features below.

Items are grouped by priority. Each is scoped as a self-contained unit of work
that can be specced individually later (brainstorm → spec → plan → execute).

## High priority

- [x] **Netflix-style profiles.** Multiple named profiles on one server, each
      with its own watch progress, favorites, and "continue watching" row.
      Profile switcher on the home screen. No per-profile password — gate the
      whole server instead (see shared-password auth).
  - Schema: new `profiles` table; move `watch_progress.user_id` (or equivalent)
    to reference it; add `favorites` table keyed by profile.
  - UI: profile picker on first load; avatar in top bar to switch.

- [ ] **Shared-password auth.** Single password gates the whole server (login
      screen → signed cookie/session). Configurable from Settings. Intended for
      exposing Jukebox outside the LAN.
  - Rate-limit login attempts.
  - Session persists long (30+ days) since this is a personal server.

- [ ] **Next Up / auto-advance for TV.** After an episode ends (or near the
      end), show a "Next Episode" card and auto-play. "Next up" row on home that
      surfaces the next unwatched episode of shows the profile is mid-way
      through.
  - Server: endpoint that, given a show + profile, returns the next unwatched
    episode.
  - Player: end-of-video overlay with countdown + skip button.

- [ ] **Casting (Chromecast / AirPlay / DLNA).** At minimum AirPlay + Chromecast
      from the web player. DLNA is nice-to-have.
  - AirPlay: `x-webkit-airplay="allow"` + compatible stream (may force
    transcoding for `.mkv`).
  - Chromecast: Cast sender SDK + receiver app or default media receiver with
    direct stream URL.

- [ ] **Mobile-friendly UI / PWA.** Responsive layouts for all pages,
      touch-friendly player controls, installable PWA with app icon and offline
      shell (not offline video).
  - Audit existing pages for `md:`/`lg:` breakpoints.
  - Add `manifest.webmanifest` + service worker for shell caching.

## Medium priority

- [x] **Settings page.** Consolidate TMDB API key, library paths, shared
      password, scan schedule, and profile management into one `/settings`
      route. Replace or absorb `/setup`.

- [x] **Scan status visible in main UI.** Persistent scan indicator in the top
      bar (spinner + "Scanning 42/310" + last-scan timestamp). Click opens scan
      detail/log. Trigger manual scan from there instead of navigating to
      `/scan`.

- [x] **Periodic background scans.** Scheduler runs `scanLibrary()` every N
      hours (default 6h, configurable in Settings). Skip if a scan is already
      running. Emit events the UI can subscribe to via SSE/WebSocket so the
      indicator updates live.

- [ ] **File watcher for instant rescans.** Use `chokidar` (or `fs.watch`) on
      library paths; debounce events and trigger a targeted rescan of the
      changed directory. Complements periodic scans rather than replacing them.

- [ ] **Search.** Full-text search across movies, shows, and episodes (title,
      overview, cast). SQLite FTS5 virtual table populated during scan. Keyboard
      shortcut (`/`) + search bar in top nav.

- [ ] **Semantic search (local embeddings).** Layer on top of full-text search.
      Generate embeddings for each title's overview during scan using a small
      local model (e.g. `all-MiniLM-L6-v2` via `transformers.js` or similar).
      Store vectors in SQLite; query by cosine similarity. Enables "movies about
      time loops" style queries.
  - Start as a toggle/secondary mode; fall back to FTS if the model isn't
    loaded.

- [ ] **Subtitle support.** Detect sidecar `.srt`/`.vtt`/`.ass` files next to
      video files during scan. Expose as `<track>` elements in the player with a
      language selector. Convert `.srt` to `.vtt` on-the-fly if needed. Extract
      embedded subtitles from `.mkv` as a later enhancement.

- [ ] **Audio track selection.** Expose audio tracks from the container in the
      player UI (multi-language releases). Requires probing the file with
      `ffprobe` during scan and either direct playback (if browser supports) or
      transcoding the selected track.

- [ ] **Manual mark watched / unwatched.** Context menu or button on any
      movie/episode to toggle watched state without playing. Also "mark season
      watched", "mark show watched".

## Lower priority

- [ ] **Recently added row on home.** Surface items scanned in the last 30 days,
      newest first.

- [ ] **Library stats.** Small Settings section: total items, total size on
      disk, hours of content, last scan time, items with missing metadata.

- [ ] **Basic transcoding (scoped start).** For now, the goal is "play `.mkv` in
      Safari" — not a full transcoding matrix. Spawn `ffmpeg` on demand to
      remux/transcode incompatible containers to fMP4/HLS when the browser can't
      play the source directly. Detect client capabilities; direct-stream when
      possible. Full adaptive-bitrate transcoding is out of scope for this pass.

## Explicitly out of scope (for now)

- Collections / genre pages / advanced filters
- Manual metadata override UI
- Offline downloads
- Delete/manage files from UI
- Multiple libraries of the same type
