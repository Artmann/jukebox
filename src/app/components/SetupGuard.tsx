import { Navigate, Outlet } from 'react-router-dom'

import { useSetupStatus } from '../hooks/useSetupStatus'

export function SetupGuard() {
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
