import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      devOptions: {
        enabled: false
      },
      manifestFilename: 'manifest.webmanifest',
      manifest: false,
      includeAssets: [
        'offline.html',
        'images/favicon.ico',
        'images/favicon-96x96.png',
        'images/apple-touch-icon.png',
        'images/jukebox-icon.png',
        'images/jukebox-icon-28.png',
        'images/web-app-manifest-192x192.png',
        'images/web-app-manifest-512x512.png'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // Try network for navigations, fall back to the cached app shell
        // (index.html) when available, and finally to offline.html.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'jukebox-pages',
              networkTimeoutSeconds: 5,
              precacheFallback: {
                fallbackURL: '/offline.html'
              }
            }
          },
          {
            urlPattern: /^\/images\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'jukebox-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  publicDir: path.resolve(__dirname, 'public'),
  root: './src/app',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true
  }
})
