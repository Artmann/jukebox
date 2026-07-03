/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'

import { registerSW } from 'virtual:pwa-register'

import { AuthGuard } from './components/AuthGuard'
import { SetupGuard } from './components/SetupGuard'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { MoviesPage } from './pages/Movies'
import { ScanPage } from './pages/Scan'
import { SettingsAuthPage } from './pages/SettingsAuth'
import { SettingsLibrariesPage } from './pages/SettingsLibraries'
import { SettingsProfilesPage } from './pages/SettingsProfiles'
import { SettingsScanSchedulePage } from './pages/SettingsScanSchedule'
import { SetupPage } from './pages/Setup'
import { ShowDetailPage } from './pages/ShowDetail'
import { ShowsPage } from './pages/Shows'
import { WatchPage } from './pages/WatchLazy'
import './index.css'

const queryClient = new QueryClient()

// Register the service worker for PWA support. In development the plugin is
// configured with devOptions.enabled: false, so this becomes a no-op.
registerSW({ immediate: true })

const elem = document.getElementById('root')
if (!elem) throw new Error('Root element not found')

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={<LoginPage />}
          />

          <Route element={<AuthGuard />}>
            <Route
              path="/scan"
              element={<ScanPage />}
            />
            <Route
              path="/setup"
              element={<SetupPage />}
            />

            <Route element={<SetupGuard />}>
              <Route
                path="/"
                element={<HomePage />}
              />
              <Route
                path="/movies"
                element={<MoviesPage />}
              />
              <Route
                path="/shows"
                element={<ShowsPage />}
              />
              <Route
                path="/shows/:id"
                element={<ShowDetailPage />}
              />
              <Route
                path="/settings"
                element={
                  <Navigate
                    to="/settings/profiles"
                    replace
                  />
                }
              />
              <Route
                path="/settings/profiles"
                element={<SettingsProfilesPage />}
              />
              <Route
                path="/settings/libraries"
                element={<SettingsLibrariesPage />}
              />
              <Route
                path="/settings/scan-schedule"
                element={<SettingsScanSchedulePage />}
              />
              <Route
                path="/settings/auth"
                element={<SettingsAuthPage />}
              />
              <Route
                path="/watch/:id"
                element={
                  <Suspense>
                    <WatchPage />
                  </Suspense>
                }
              />
              <Route
                path="/watch/episode/:id"
                element={
                  <Suspense>
                    <WatchPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        theme="dark"
      />
    </QueryClientProvider>
  </StrictMode>
)

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const hotData = import.meta.hot.data as {
    root?: ReturnType<typeof createRoot>
  }
  const root = (hotData.root ??= createRoot(elem))
  root.render(app)
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app)
}
