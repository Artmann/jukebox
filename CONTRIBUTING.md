# Contributing to Jukebox

Thanks for your interest in contributing. This document covers how to set up a
development environment, the project's tech stack, and how to ship changes.

## Tech Stack

- **Runtime:** Node.js 18+
- **Backend:** [Hono](https://hono.dev/) on
  [`@hono/node-server`](https://github.com/honojs/node-server)
- **Frontend:** React 19 + React Router, [TanStack React Query](https://tanstack.com/query),
  [Video.js](https://videojs.com/)
- **Database:** SQLite via [Drizzle ORM](https://orm.drizzle.team/) and
  [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) +
  [shadcn/ui](https://ui.shadcn.com/) (Radix primitives)
- **Bundler:** [rolldown](https://rolldown.rs/) for the server bundle,
  [Vite](https://vite.dev/) for the client
- **Tests:** [Vitest](https://vitest.dev/) +
  [Testing Library](https://testing-library.com/)

## Local Setup

1. **Clone and install**

   ```bash
   git clone git@github.com:Artmann/jukebox.git
   cd jukebox
   npm install
   ```

2. **Run the dev server**

   ```bash
   npm run dev
   ```

   This starts the Hono backend on port `1990` and the Vite dev server on port
   `5173`. The backend proxies non-API requests to Vite, so open
   `http://localhost:1990` to use the app with hot-reload.

3. **Configure on first launch**

   Open the app, paste in your
   [TMDB API key](https://www.themoviedb.org/settings/api), and point Jukebox
   at a folder containing some video files.

## Project Layout

```
src/
  api/                # Hono routes
    index.ts          # App setup, static serving, Vite proxy
    routes/           # API endpoints (library, stream, scan, etc.)
  app/                # React frontend
    pages/            # Route components
    components/       # Reusable UI
    hooks/            # React hooks
  config/             # Config file + paths (~/.jukebox/)
  database/           # Drizzle schema + connection
  scripts/            # CLI scripts (scan, migrate)
  services/           # Business logic (scanner, TMDB, parsers)
  index.ts            # Server entry point
bin/                  # npm bin entry
scripts/build.ts      # Build orchestration (Vite + rolldown)
drizzle/              # SQL migrations
```

## Scripts

| Command               | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Start the dev server (Hono + Vite)        |
| `npm run build`       | Build client (Vite) and server (rolldown) |
| `npm start`           | Run the production build                  |
| `npm test`            | Run the Vitest suite                      |
| `npm run typecheck`   | Type-check with `tsc --noEmit`            |
| `npm run lint`        | Run ESLint                                |
| `npm run lint:fix`    | Run ESLint with `--fix`                   |
| `npm run format`      | Format with Prettier                      |
| `npm run db:generate` | Generate a new Drizzle migration          |
| `npm run db:migrate`  | Apply migrations                          |
| `npm run db:studio`   | Launch Drizzle Studio                     |

## Code Style

See [`CODE_STYLE.md`](CODE_STYLE.md) for the conventions enforced in this
repo. The short version:

- No semicolons, single quotes
- Full variable names (`request`, not `req`); no `CONSTANT_CASE`
- No `any`, no non-null assertions, no floating promises
- Use `??` over `||`
- Alphabetical ordering by default
- Whitespace to improve readability — blank lines around control flow and
  before returns
- Tests live next to their implementation; prefer `toEqual` over `toBe` and
  compare whole objects

## Database Changes

When you change `src/database/schema.ts`:

```bash
npm run db:generate
```

This produces a new SQL file under `drizzle/`. Commit it alongside your schema
change. Migrations run automatically on server startup.

## Building for Release

```bash
npm run build
```

This produces:

- `dist/client/` — built frontend (Vite)
- `dist/server/index.js` — bundled server (rolldown, ~260 KB)

The `prepublishOnly` hook runs the build automatically when you `npm publish`.

## Publishing to npm

```bash
npm version <patch|minor|major>
npm publish
git push --follow-tags
```

## Reporting Bugs

Open an issue with steps to reproduce, expected vs actual behavior, and your
Node version. Logs from the terminal running `jukebox-media-server` are
helpful.

## Pull Requests

- Keep changes focused — one concern per PR
- Add tests when fixing bugs or adding behavior
- Run `npm run typecheck`, `npm run lint`, and `npm test` before opening a PR
