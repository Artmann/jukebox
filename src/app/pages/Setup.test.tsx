import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'

import { SetupPage } from './Setup'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn()
  }
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

interface FetchRule {
  body: unknown
  ok?: boolean
  status?: number
}

// The typed api client hands globalThis.fetch an absolute URL, so mock
// matching happens on the request's path.
function requestPath(url: string | URL): string {
  const parsed = new URL(url, 'http://localhost:3000')

  return parsed.pathname + parsed.search
}

function setFetchRules(rules: Record<string, FetchRule>) {
  global.fetch = vi.fn((url: string | URL) => {
    const key = requestPath(url)
    const matched = Object.entries(rules).find(([prefix]) =>
      key.startsWith(prefix)
    )?.[1] ?? { body: {}, ok: true }

    const ok = matched.ok ?? true

    return Promise.resolve(
      new Response(JSON.stringify(matched.body), {
        headers: { 'content-type': 'application/json' },
        status: matched.status ?? (ok ? 200 : 400)
      })
    )
  }) as unknown as typeof fetch
}

function renderSetup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function completeSetupCalls() {
  const fetchMock = vi.mocked(global.fetch)

  return fetchMock.mock.calls.filter(
    ([url]) => requestPath(url as string | URL) === '/api/setup/complete'
  )
}

function requestBodyJson(options: RequestInit | undefined): unknown {
  const body = options?.body

  if (typeof body === 'string') {
    return JSON.parse(body)
  }

  // The typed client encodes JSON bodies as a Uint8Array. instanceof is
  // unreliable across the jsdom/node realm boundary, so detect it
  // structurally.
  if (ArrayBuffer.isView(body)) {
    return JSON.parse(new TextDecoder().decode(body))
  }

  throw new Error('Expected the request to carry a JSON body.')
}

async function addFolderWithPath(path: string) {
  fireEvent.click(screen.getByText(/Add a folder|Add another/))

  const inputs = screen.getAllByPlaceholderText('/mnt/media/movies')
  const input = inputs[inputs.length - 1] as Element

  fireEvent.change(input, { target: { value: path } })

  // Blur commits the path and kicks off async live validation — flush it
  // inside act so its state updates don't leak past the helper.
  await act(async () => {
    fireEvent.blur(input)
    await Promise.resolve()
  })
}

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setFetchRules({
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      }
    })
  })

  it('renders the welcome heading', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Set up your library')).toBeInTheDocument()
    })
  })

  it('renders the media libraries section', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Libraries')).toBeInTheDocument()
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })
  })

  it('disables the submit button until a folder has a path', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Save and scan')).toBeInTheDocument()
    })

    expect(screen.getByText('Save and scan').closest('button')).toBeDisabled()

    await addFolderWithPath('/media/movies')

    expect(
      screen.getByText('Save and scan').closest('button')
    ).not.toBeDisabled()
  })

  it('adds a library row when clicking add a folder', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add a folder'))

    expect(screen.getByPlaceholderText('/mnt/media/movies')).toBeInTheDocument()
  })

  it('pre-populates with existing libraries', async () => {
    setFetchRules({
      '/api/setup': {
        body: {
          libraries: [
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ],
          libraryCount: 1,
          needsSetup: false
        }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('/media/movies')).toBeInTheDocument()
    })
  })

  it('submits successfully and navigates to the scan page with auto-start', async () => {
    setFetchRules({
      '/api/setup/complete': { body: { success: true } },
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: { entries: [], parent: null, path: '/media', separator: '/' }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('/media/movies')

    fireEvent.click(screen.getByText('Save and scan'))

    await waitFor(() => {
      expect(completeSetupCalls()).toHaveLength(1)
    })

    const [, options] = completeSetupCalls()[0] as [string, RequestInit]

    expect(requestBodyJson(options)).toEqual({
      libraries: [{ name: '', path: '/media/movies', type: 'movies' }]
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/scan', {
        state: { autoStart: true }
      })
    })
  })

  it('shows the server error message on failed submission', async () => {
    setFetchRules({
      '/api/setup/complete': {
        body: { error: { message: 'Server error' } },
        ok: false
      },
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: { entries: [], parent: null, path: '/media', separator: '/' }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('/media/movies')

    fireEvent.click(screen.getByText('Save and scan'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error')
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('attaches server field errors to the offending rows', async () => {
    setFetchRules({
      '/api/setup/complete': {
        body: {
          error: {
            fieldErrors: [
              {
                index: 1,
                message:
                  "Library path doesn't exist or isn't readable: /media/shows. Check the path and Jukebox's file permissions."
              }
            ],
            message: 'Fix the highlighted folders, then try again.'
          }
        },
        ok: false
      },
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: { entries: [], parent: null, path: '/media', separator: '/' }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('/media/movies')
    await addFolderWithPath('/media/shows')

    fireEvent.click(screen.getByText('Save and scan'))

    await waitFor(() => {
      expect(
        screen.getByText(
          "Library path doesn't exist or isn't readable: /media/shows. Check the path and Jukebox's file permissions."
        )
      ).toBeInTheDocument()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'Fix the highlighted folders, then try again.'
    )
  })

  it('blocks duplicate paths before reaching the server', async () => {
    setFetchRules({
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: { entries: [], parent: null, path: '/media', separator: '/' }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('/media/movies')
    await addFolderWithPath('/media/movies')

    fireEvent.click(screen.getByText('Save and scan'))

    await waitFor(() => {
      expect(
        screen.getByText(
          "You've added /media/movies more than once. Remove the duplicate row."
        )
      ).toBeInTheDocument()
    })

    expect(completeSetupCalls()).toHaveLength(0)
  })

  it('marks a row invalid when live validation fails', async () => {
    setFetchRules({
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: {
          error: { message: "Folder doesn't exist. Check the path." }
        },
        ok: false
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('D:\\Media\\Missing')

    await waitFor(() => {
      expect(
        screen.getByText("Folder doesn't exist. Check the path.")
      ).toBeInTheDocument()
    })
  })

  it('marks a row valid when live validation succeeds', async () => {
    setFetchRules({
      '/api/setup': {
        body: { libraries: [], libraryCount: 0, needsSetup: true }
      },
      '/api/filesystem/browse': {
        body: {
          entries: [],
          parent: '/media',
          path: '/media/movies',
          separator: '/'
        }
      }
    })

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    await addFolderWithPath('/media/movies')

    await waitFor(() => {
      expect(screen.getByLabelText('Folder found')).toBeInTheDocument()
    })
  })
})
