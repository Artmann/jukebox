import { defineConfig } from 'rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist/server',
    format: 'esm',
  },
  platform: 'node',
  external: ['better-sqlite3', 'vite', /@tailwindcss/, /@vitejs/],
  resolve: {
    alias: {
      '@': './src',
    },
  },
})
