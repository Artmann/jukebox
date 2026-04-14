# Contributing to Jukebox

Thanks for your interest in contributing. This document covers how to set up a
development environment, the project's tech stack, and how to ship changes.

## Tech Stack

- **Runtime:** Node.js 18+ (development uses [Bun](https://bun.sh/))
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

> The published package is Node-compatible so end users can install it with
> `npm` or `npx`. For local development, this project uses Bun.

## Local Setup

1. **Clone and install**

   ```bash
   git clone git@github.com:Artmann/jukebox.git
   cd jukebox
   bun install
   ```

2. **Run the dev server**

   ```bash
   bun run dev
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
| `bun run dev`         | Start the dev server (Hono + Vite)        |
| `bun run build`       | Build client (Vite) and server (rolldown) |
| `bun start`           | Run the production build                  |
| `bun test`            | Run the Vitest suite                      |
| `bun run typecheck`   | Type-check with `tsc --noEmit`            |
| `bun run lint`        | Run ESLint                                |
| `bun run lint:fix`    | Run ESLint with `--fix`                   |
| `bun run format`      | Format with Prettier                      |
| `bun run db:generate` | Generate a new Drizzle migration          |
| `bun run db:migrate`  | Apply migrations                          |
| `bun run db:studio`   | Launch Drizzle Studio                     |

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
bun run db:generate
```

This produces a new SQL file under `drizzle/`. Commit it alongside your schema
change. Migrations run automatically on server startup.

## Building for Release

```bash
bun run build
```

This produces:

- `dist/client/` — built frontend (Vite)
- `dist/server/index.js` — bundled server (rolldown, ~260 KB)

The `prepublishOnly` hook runs the build automatically when you publish.

## Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please). You don't run
`npm version` or `npm publish` by hand.

### How it works

1. You merge a PR with a [Conventional Commits](https://www.conventionalcommits.org/)
   message — `feat:`, `fix:`, `chore:`, etc.
2. release-please opens (or updates) a "Release PR" on `main` titled
   `chore(main): release jukebox-media-server X.Y.Z`. The PR bumps
   `package.json`, updates `CHANGELOG.md`, and bumps
   `.release-please-manifest.json`.
3. Review the release PR. When you're happy with the version bump and notes,
   merge it.
4. Merging the release PR triggers release-please to tag the commit and
   create a GitHub Release.
5. The `publish` job in `.github/workflows/release-please.yml` then builds
   and publishes the package to npm with provenance.

### Commit message format

Use Conventional Commits so release-please can determine the right version
bump and generate a changelog:

| Prefix     | Bump  | Example                                |
| ---------- | ----- | -------------------------------------- |
| `fix:`     | patch | `fix: handle missing range header`     |
| `feat:`    | minor | `feat: add subtitle support`           |
| `feat!:`   | major | `feat!: rename config schema`          |
| `docs:`    | none  | `docs: clarify install instructions`   |
| `chore:`   | none  | `chore: bump dependencies`             |
| `refactor:`| none  | `refactor: extract scanner module`     |
| `test:`    | none  | `test: add filename parser cases`      |

For breaking changes, add `!` after the type (`feat!:`) or include a
`BREAKING CHANGE:` footer in the commit body.

### First-time setup (one-time)

These are already done, but documented for reference:

- An `NPM_TOKEN` secret with publish access to `jukebox-media-server` is
  configured in repo Settings → Secrets and variables → Actions.
- `release-please-config.json` and `.release-please-manifest.json` track the
  release configuration and current version.

## Reporting Bugs

Open an issue with steps to reproduce, expected vs actual behavior, and your
Node version. Logs from the terminal running `jukebox-media-server` are
helpful.

## Pull Requests

- Keep changes focused — one concern per PR
- Add tests when fixing bugs or adding behavior
- Run `bun run typecheck`, `bun run lint`, and `bun test` before opening a PR
