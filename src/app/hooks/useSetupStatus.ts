import { useQuery } from '@tanstack/react-query'

interface SetupStatus {
  hasApiKey: boolean
  libraryCount: number
  needsSetup: boolean
}

async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await fetch('/api/setup')

  if (!response.ok) {
    throw new Error('Failed to check setup status')
  }

  return (await response.json()) as SetupStatus
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setupStatus'],
    queryFn: fetchSetupStatus
  })
}
