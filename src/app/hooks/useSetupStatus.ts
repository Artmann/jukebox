import { useQuery } from '@tanstack/react-query'

interface SetupStatus {
  libraryCount: number
  needsSetup: boolean
}

export const setupStatusQueryKey = ['setupStatus'] as const

async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch('/api/setup')

  if (!response.ok) {
    throw new Error('Failed to check setup status')
  }

  return (await response.json()) as SetupStatus
}

export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusQueryKey,
    queryFn: fetchSetupStatus
  })
}
