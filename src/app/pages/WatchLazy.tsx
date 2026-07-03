import { lazy } from 'react'

export const WatchPage = lazy(() =>
  import('./Watch').then((module) => ({ default: module.WatchPage }))
)
