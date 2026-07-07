import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api-client'

export type {
  RouteLatency,
  TelemetryError,
  TelemetrySpan,
  TelemetryStats,
  TraceDetail,
  TraceSummary
} from '../../api/contract'

const tracesKey = ['telemetry', 'traces'] as const
const errorsKey = ['telemetry', 'errors'] as const
const statsKey = ['telemetry', 'stats'] as const

export interface TraceFilters {
  route?: string
  status?: string
}

export function useTraces(filters: TraceFilters = {}) {
  return useQuery({
    queryKey: [...tracesKey, filters],
    queryFn: () =>
      api((client) =>
        client.telemetry.listTraces({
          urlParams: {
            limit: '100',
            route: filters.route,
            status: filters.status
          }
        })
      ),
    refetchInterval: 5_000
  })
}

export function useTrace(traceId: string | null) {
  return useQuery({
    enabled: traceId !== null,
    queryKey: [...tracesKey, traceId],
    queryFn: () =>
      api((client) =>
        client.telemetry.getTrace({ path: { traceId: traceId ?? '' } })
      )
  })
}

export function useTelemetryErrors(source?: string) {
  return useQuery({
    queryKey: [...errorsKey, source ?? 'all'],
    queryFn: () =>
      api((client) =>
        client.telemetry.listErrors({ urlParams: { limit: '200', source } })
      ),
    refetchInterval: 5_000
  })
}

export function useTelemetryStats(windowMinutes: number) {
  return useQuery({
    queryKey: [...statsKey, windowMinutes],
    queryFn: () =>
      api((client) =>
        client.telemetry.getStats({
          urlParams: { windowMinutes: String(windowMinutes) }
        })
      ),
    refetchInterval: 5_000
  })
}
