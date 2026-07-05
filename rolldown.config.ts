import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist/server',
    format: 'esm',
  },
  platform: 'node',
  // The Node bundle never executes the Bun branches (runtime-detected dynamic
  // imports), so bun:sqlite and @effect/platform-bun stay external instead of
  // failing to resolve at bundle time. effect/@effect/platform-node get
  // bundled like hono did — the npm package gains no runtime dependencies.
  external: [
    'better-sqlite3',
    'vite',
    /@tailwindcss/,
    /@vitejs/,
    /^bun:/,
    '@effect/platform-bun'
  ],
  resolve: {
    alias: {
      '@': './src',
    },
  },
})
