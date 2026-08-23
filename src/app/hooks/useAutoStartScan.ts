import { useEffect, useEffectEvent, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface AutoStartScanOptions {
  isScanRunning: boolean
  isStatusLoaded: boolean
  startScan: () => Promise<void>
}

/**
 * Kicks off a scan automatically when arriving from setup ("Save and scan").
 * The router state is cleared right away so a refresh doesn't re-trigger,
 * and a scan that is already running is never started twice.
 */
export function useAutoStartScan({
  isScanRunning,
  isStatusLoaded,
  startScan
}: AutoStartScanOptions): void {
  const location = useLocation()
  const navigate = useNavigate()
  const autoStartedRef = useRef(false)

  const startScanIfIdle = useEffectEvent(() => {
    if (!isScanRunning) {
      void startScan()
    }
  })

  useEffect(() => {
    const state = location.state as { autoStart?: boolean } | null

    if (!state?.autoStart || autoStartedRef.current || !isStatusLoaded) {
      return
    }

    autoStartedRef.current = true
    void navigate(location.pathname, { replace: true, state: null })

    startScanIfIdle()
  }, [isStatusLoaded, location, navigate])
}
