# Contributing to Jukebox

This guide covers everything developers need to know to work on this project.

## Tech Stack

**Backend:**
- Hono - Web framework
- Drizzle ORM - Database layer
- SQLite - Database (via better-sqlite3)

**Frontend:**
- React 19
- React Router v7
- TanStack React Query
- Video.js - Video player
- Tailwind CSS
- Radix UI - Component primitives

**Tooling:**
- Bun - Runtime and package manager
- Vite - Frontend bundler
- TypeScript

## Project Structure

```
src/
├── api/                    # Hono API routes
│   └── routes/
│       ├── library.ts      # Movie listing endpoints
│       ├── stream.ts       # Video streaming
│       └── progress.ts     # Watch progress tracking
│
├── app/                    # React frontend
│   ├── pages/              # Route pages
│   ├── components/         # UI components
│   └── hooks/              # React hooks
│
├── database/
│   ├── schema.ts           # Drizzle schema
│   └── index.ts            # Database setup
│
├── services/
│   ├── scanner.ts          # Library scanning
│   ├── tmdb.ts             # TMDB API integration
│   └── filename-parser.ts  # Movie title extraction
│
├── components/ui/          # Shadcn components
└── index.ts                # Server entry point
```

## Development Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Create `.env` file:
   ```
   TMDB_API_KEY=your_api_key
   ```

3. Start development server:
   ```bash
   bun dev
   ```
   - Backend runs on port 1990
   - Vite dev server runs on port 5173

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server with HMR |
| `bun start` | Run production server |
| `bun run build` | Build frontend assets |
| `bun run scan <path>` | Scan movie library |
| `bun run format` | Format code with Prettier |
| `bun test` | Run tests |

## Code Style

See `CODE_STYLE.md` for full guidelines. Key points:

- Use full variable names (`request` not `req`)
- No `CONSTANT_CASE` - use `camelCase`
- No `any` types - use proper types or `unknown`
- Avoid non-null assertions (`!`)
- Prefer nullish coalescing (`??` over `||`)
- Single quotes, no semicolons
- Always await or handle promises

**Formatting:**
- Use whitespace to improve readability
- Blank line after const groups and before returns
- Order items alphabetically

## Database

**Schema:** Defined in `src/database/schema.ts`

**Tables:**
- `movies` - Movie metadata and file info
- `watchProgress` - Playback position tracking

**Migrations:**
```bash
# Generate migration after schema changes
bunx drizzle-kit generate

# Push changes to database
bunx drizzle-kit push
```

## API Endpoints

**Library:**
- `GET /api/library/movies` - List all movies
- `GET /api/library/movies/:id` - Get movie details

**Streaming:**
- `GET /api/stream/:id` - Stream video (supports range requests)

**Progress:**
- `GET /api/progress/:movieId` - Get watch progress
- `PUT /api/progress/:movieId` - Save watch progress

## Testing

- Place test files next to implementation (e.g., `parser.test.ts`)
- Use `toEqual` over `toBe`
- Compare entire objects in assertions

```bash
bun test
```

## Building

```bash
bun run build
```

This builds frontend assets to `dist/` using Bun's bundler with Tailwind CSS support.
