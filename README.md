# Jukebox

A self-hosted media server with a Netflix-style interface for browsing and streaming your movie collection.

## Features

- **Netflix-style UI** - Browse your library with poster art, backdrops, and movie details
- **Automatic metadata** - Fetches movie info, posters, and trailers from TMDB
- **Video streaming** - Stream any video format with seeking support
- **Watch progress** - Automatically saves and resumes playback position
- **Trailer previews** - Watch YouTube trailers directly in the movie details modal

## Requirements

- [Bun](https://bun.sh) (v1.0 or later)
- [TMDB API Key](https://www.themoviedb.org/settings/api) (free)

## Quick Start

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd jukebox
   bun install
   ```

2. **Configure environment**

   Create a `.env` file in the project root:
   ```
   TMDB_API_KEY=your_api_key_here
   ```

3. **Scan your movie library**
   ```bash
   bun run scan "/path/to/your/movies"
   ```

4. **Start the server**
   ```bash
   bun dev
   ```

5. **Open in browser**

   Navigate to `http://localhost:5173`

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `TMDB_API_KEY` | Your TMDB API key (required) | - |
| `PORT` | Server port | `1990` |

## Scanning Your Library

The scanner recursively finds video files and fetches metadata from TMDB:

```bash
bun run scan "/path/to/movies"
```

**Supported formats:** `.mp4`, `.mkv`, `.avi`, `.mov`, `.wmv`, `.m4v`, `.webm`, `.flv`, `.mpeg`, `.mpg`

**Naming tips for best results:**
- `Movie Title (2020).mkv`
- `Movie.Title.2020.1080p.BluRay.mkv`
- `Movie Title [2020].mp4`

Re-run the scan command anytime you add new movies to your library.

## Production

Build and run for production:

```bash
bun run build
bun start
```

## License

MIT
