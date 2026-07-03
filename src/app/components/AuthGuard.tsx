import { Navigate, Outlet } from 'react-router-dom'

import { useAuthStatus } from '../hooks/useAuth'
import { SearchPaletteProvider } from './SearchPaletteProvider'

export function AuthGuard() {
  const { data, isLoading } = useAuthStatus()

  if (isLoading) {
    return null
  }

  if (data?.enabled && !data.authenticated) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  return (
    <SearchPaletteProvider>
      <Outlet />
    </SearchPaletteProvider>
  )
}
