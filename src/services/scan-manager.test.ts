// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestDatabase } from '../database/test-database'

const testDb = createTestDatabase()

vi.mock('../database', () => ({
  db: testDb.db,
  schema: testDb.schema
}))

const { createScanManager, parseLibraryResults } = await import(
  './scan-manager'
)

interface FakeLibrary {
  id: number
  name: string
  path: string
  type: 'movies' | 'shows'
}

async function reset() {
  await testDb.db.delete(testDb.schema.scanJobs)
  await testDb.db.delete(testDb.schema.libraries)
}

function insertLibrary(library: FakeLibrary) {
  testDb.db
    .insert(testDb.schema.libraries)
    .values({
      id: library.id,
      name: library.name,
      path: library.path,
      type: library.type,
      createdAt: new Date()
    })
    .run()
}

beforeEach(async () => {
  await reset()
})

describe('scanManager.start', () => {
  it('creates a scan_jobs row with status running and completes it as done', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 2, total: 5, updated: 1 }),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const result = await manager.start()

    expect(result).toEqual({
      added: 2,
      total: 5,
      updated: 1,
      status: 'done'
    })

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
    expect(jobs[0]?.status).toEqual('done')
    expect(jobs[0]?.added).toEqual(2)
    expect(jobs[0]?.total).toEqual(5)
    expect(jobs[0]?.updated).toEqual(1)
    expect(jobs[0]?.errorMessage).toEqual(null)
    expect(jobs[0]?.endedAt).not.toEqual(null)
  })

  it('returns early with alreadyRunning when a scan is in flight', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    let release: () => void = () => {
      // replaced before the Promise executor returns
    }

    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const manager = createScanManager({
      scanLibrary: async () => {
        await gate

        return { added: 0, total: 0, updated: 0 }
      },
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const jobStarted = new Promise<void>((resolve) => {
      manager.on('job-started', () => resolve())
    })

    const firstPromise = manager.start()

    // Wait until the first call has inserted its scan_jobs row.
    await jobStarted

    const secondResult = await manager.start()

    expect(secondResult).toEqual({ status: 'already-running' })

    release()

    await firstPromise

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
  })

  it('returns early when there are no libraries', async () => {
    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 }),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const result = await manager.start()

    expect(result).toEqual({
      status: 'no-libraries',
      message:
        'No libraries configured. Add a library in Settings before scanning.'
    })

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(0)
  })

  it('marks the job as error when a library scan throws', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const manager = createScanManager({
      scanLibrary: () => Promise.reject(new Error('disk on fire')),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const result = await manager.start()

    expect(result.status).toEqual('error')

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
    expect(jobs[0]?.status).toEqual('error')
    expect(jobs[0]?.errorMessage).toEqual(
      'Movies — disk on fire'
    )
  })

  it('emits job-started, progress, and job-completed events', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const manager = createScanManager({
      scanLibrary: async (_path, onProgress) => {
        await onProgress?.({ added: 1, total: 1, updated: 0 })

        return { added: 1, total: 1, updated: 0 }
      },
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const events: Array<{ type: string; payload: unknown }> = []

    manager.on('job-started', (payload) => {
      events.push({ type: 'job-started', payload })
    })
    manager.on('library-start', (payload) => {
      events.push({ type: 'library-start', payload })
    })
    manager.on('file-scanned', (payload) => {
      events.push({ type: 'file-scanned', payload })
    })
    manager.on('library-complete', (payload) => {
      events.push({ type: 'library-complete', payload })
    })
    manager.on('job-completed', (payload) => {
      events.push({ type: 'job-completed', payload })
    })

    await manager.start()

    const types = events.map((event) => event.type)

    expect(types).toEqual([
      'job-started',
      'library-start',
      'file-scanned',
      'library-complete',
      'job-completed'
    ])
  })
})

describe('per-library results persistence', () => {
  it('stores a result entry per library, including errors', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })
    insertLibrary({ id: 2, name: 'Shows', path: '/shows', type: 'shows' })

    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 2, total: 3, updated: 1 }),
      scanShowLibrary: () => Promise.reject(new Error('folder gone'))
    })

    await manager.start()

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(parseLibraryResults(jobs[0]?.libraryResults ?? null)).toEqual([
      {
        added: 2,
        error: null,
        libraryId: 1,
        name: 'Movies',
        status: 'complete',
        total: 3,
        updated: 1
      },
      {
        added: 0,
        error: 'folder gone',
        libraryId: 2,
        name: 'Shows',
        status: 'error',
        total: 0,
        updated: 0
      }
    ])
  })
})

describe('parseLibraryResults', () => {
  it('returns an empty array for null, invalid JSON, and non-arrays', () => {
    expect(parseLibraryResults(null)).toEqual([])
    expect(parseLibraryResults('not json')).toEqual([])
    expect(parseLibraryResults('{"an":"object"}')).toEqual([])
  })
})

describe('scanManager.getStatus', () => {
  it('reports idle with null lastJob when nothing has run', async () => {
    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 }),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    const status = await manager.getStatus()

    expect(status).toEqual({
      isRunning: false,
      currentJob: null,
      lastJob: null
    })
  })

  it('reports the last completed job after a scan', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 3, total: 7, updated: 0 }),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    await manager.start()

    const status = await manager.getStatus()

    expect(status.isRunning).toEqual(false)
    expect(status.currentJob).toEqual(null)
    expect(status.lastJob?.status).toEqual('done')
    expect(status.lastJob?.added).toEqual(3)
    expect(status.lastJob?.total).toEqual(7)
  })
})

describe('scanManager.recoverInterruptedJobs', () => {
  it('marks jobs left in running state as error', async () => {
    testDb.db
      .insert(testDb.schema.scanJobs)
      .values({
        startedAt: new Date(Date.now() - 10_000),
        status: 'running',
        added: 0,
        updated: 0,
        total: 0
      })
      .run()

    const manager = createScanManager({
      scanLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 }),
      scanShowLibrary: () => Promise.resolve({ added: 0, total: 0, updated: 0 })
    })

    await manager.recoverInterruptedJobs()

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
    expect(jobs[0]?.status).toEqual('error')
    expect(jobs[0]?.errorMessage).toEqual(
      'Server restarted mid-scan. Run a manual scan to resume.'
    )
    expect(jobs[0]?.endedAt).not.toEqual(null)
  })
})
