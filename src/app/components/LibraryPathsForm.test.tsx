import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LibraryPathsForm,
  makeLibraryDraft,
  type LibraryDraft,
  type LibraryRowValidation
} from './LibraryPathsForm'

interface HarnessProps {
  initial: LibraryDraft[]
  onPathCommitted?: (library: LibraryDraft) => void
  validation?: Record<string, LibraryRowValidation>
}

let latestValue: LibraryDraft[] = []

function Harness({ initial, onPathCommitted, validation }: HarnessProps) {
  const [libraries, setLibraries] = useState<LibraryDraft[]>(initial)

  latestValue = libraries

  return (
    <LibraryPathsForm
      onChange={setLibraries}
      onPathCommitted={onPathCommitted}
      validation={validation}
      value={libraries}
    />
  )
}

function renderForm(props: HarnessProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>
  )
}

function draft(partial: Partial<LibraryDraft>): LibraryDraft {
  return { ...makeLibraryDraft(), ...partial }
}

beforeEach(() => {
  latestValue = []
  vi.restoreAllMocks()
})

describe('LibraryPathsForm', () => {
  it('keeps an empty row when its input loses focus', () => {
    renderForm({ initial: [] })

    fireEvent.click(screen.getByText('Add a folder'))

    const input = screen.getByPlaceholderText('/mnt/media/movies')

    fireEvent.blur(input)

    expect(latestValue).toHaveLength(1)
    expect(latestValue[0]?.path).toEqual('')
  })

  it('keeps an empty focused row when the Browse button is clicked', () => {
    renderForm({ initial: [] })

    fireEvent.click(screen.getByText('Add a folder'))

    const input = screen.getByPlaceholderText('/mnt/media/movies')

    fireEvent.blur(input)
    fireEvent.click(screen.getByLabelText('Browse folders'))

    expect(latestValue).toHaveLength(1)
    expect(screen.getByText('Browse folders')).toBeInTheDocument()
  })

  it('keeps an empty focused row when "Add another" is clicked', () => {
    renderForm({
      initial: [draft({ name: '', path: '', type: 'movies' })]
    })

    fireEvent.click(screen.getByText('Add another'))

    expect(latestValue).toHaveLength(2)
  })

  it('removes exactly the clicked row and preserves the others', () => {
    const first = draft({ path: '/media/a', type: 'movies' })
    const second = draft({ path: '/media/b', type: 'shows' })
    const third = draft({ path: '/media/c', type: 'movies' })

    renderForm({ initial: [first, second, third] })

    fireEvent.click(screen.getAllByLabelText('Remove library')[0] as Element)

    expect(latestValue).toEqual([second, third])
    expect(screen.queryByText('/media/a')).not.toBeInTheDocument()
    expect(screen.getByText('/media/b')).toBeInTheDocument()
    expect(screen.getByText('/media/c')).toBeInTheDocument()
  })

  it('applies a browsed folder to the row the dialog was opened for, even after another row is removed', async () => {
    global.fetch = vi.fn((url: string | URL) => {
      const key = typeof url === 'string' ? url : url.toString()
      const isSubfolder = key.includes(encodeURIComponent('/media/b/sub'))

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            isSubfolder
              ? {
                  entries: [],
                  parent: '/media/b',
                  path: '/media/b/sub',
                  separator: '/'
                }
              : {
                  entries: [{ name: 'sub', path: '/media/b/sub' }],
                  parent: '/media',
                  path: '/media/b',
                  separator: '/'
                }
          )
      } as unknown as Response)
    }) as unknown as typeof fetch

    const first = draft({ path: '/media/a', type: 'movies' })
    const second = draft({ path: '/media/b', type: 'shows' })

    renderForm({ initial: [first, second] })

    // Open the browse dialog for the SECOND row.
    fireEvent.click(
      screen.getAllByLabelText('Browse folders')[1] as Element
    )

    await waitFor(() => {
      expect(screen.getByText('sub')).toBeInTheDocument()
    })

    // While the dialog is open, remove the FIRST row — the dialog must keep
    // targeting the row it was opened for.
    fireEvent.click(screen.getAllByLabelText('Remove library')[0] as Element)

    fireEvent.click(screen.getByText('sub'))
    fireEvent.click(screen.getByText('Select this folder'))

    expect(latestValue).toEqual([{ ...second, path: '/media/b/sub' }])
  })

  it('focuses the input of a newly added row', () => {
    renderForm({ initial: [] })

    fireEvent.click(screen.getByText('Add a folder'))

    expect(screen.getByPlaceholderText('/mnt/media/movies')).toHaveFocus()
  })

  it('fires onPathCommitted when a non-empty path is committed with Enter', () => {
    const onPathCommitted = vi.fn()

    renderForm({ initial: [], onPathCommitted })

    fireEvent.click(screen.getByText('Add a folder'))

    const input = screen.getByPlaceholderText('/mnt/media/movies')

    fireEvent.change(input, { target: { value: 'D:\\Media\\Shows' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onPathCommitted).toHaveBeenCalledTimes(1)
    expect(onPathCommitted).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'D:\\Media\\Shows' })
    )
  })

  it('does not fire onPathCommitted for an empty path', () => {
    const onPathCommitted = vi.fn()

    renderForm({ initial: [], onPathCommitted })

    fireEvent.click(screen.getByText('Add a folder'))
    fireEvent.blur(screen.getByPlaceholderText('/mnt/media/movies'))

    expect(onPathCommitted).not.toHaveBeenCalled()
  })

  it('renders per-row validation states', () => {
    const valid = draft({ path: '/media/good', type: 'movies' })
    const invalid = draft({ path: '/media/bad', type: 'shows' })
    const checking = draft({ path: '/media/slow', type: 'movies' })

    renderForm({
      initial: [valid, invalid, checking],
      validation: {
        [checking.id]: { status: 'checking' },
        [invalid.id]: {
          message: "Folder doesn't exist. Check the path.",
          status: 'invalid'
        },
        [valid.id]: { status: 'valid' }
      }
    })

    expect(screen.getByLabelText('Folder found')).toBeInTheDocument()
    expect(screen.getByLabelText('Checking folder')).toBeInTheDocument()
    expect(
      screen.getByText("Folder doesn't exist. Check the path.")
    ).toBeInTheDocument()
  })
})
