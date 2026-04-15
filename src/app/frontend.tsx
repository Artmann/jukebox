/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Routes,
  Route
} from 'react-router-dom'
import { Toaster } from 'sonner'

import { useSetupStatus } from './hooks/useSetupStatus'
import { HomePage } from './pages/Home'
import { MoviesPage } from './pages/Movies'
import { ScanPage } from './pages/Scan'
import { SettingsProfilesPage } from './pages/SettingsProfiles'
import { SetupPage } from './pages/Setup'
import { ShowDetailPage } from './pages/ShowDetail'
import { ShowsPage } from './pages/Shows'
import './index.css'

const WatchPage = lazy(() =>
  import('./pages/Watch').then((module) => ({ default: module.WatchPage }))
)

const queryClient = new QueryClient()

function SetupGuard() {
  const { data, isLoading } = useSetupStatus()

  if (isLoading) {
    return null
  }

  if (data?.needsSetup) {
    return (
      <Navigate
        to="/setup"
        replace
      />
    )
  }

  return <Outlet />
}

const elem = document.getElementById('root')
if (!elem) throw new Error('Root element not found')

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
