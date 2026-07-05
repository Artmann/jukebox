// @vitest-environment node
import { Chunk, Effect, Fiber, Layer, Stream } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'

import { databaseTestLayer } from '../database/layer'
import { createTestDatabase } from '../database/test-database'
import { parseLibraryResults, ScanManager } from './scan-manager'
import type { ScanEvent } from './scan-manager'
import { Scanner } from './scanner'
import type { ScanProgress } from './scanner'
import { ShowScanner } from './show-scanner'

const testDb = createTestDatabase()

interface FakeLibrary {
  id: number
  name: string
  path: string
  type: 'movies' | 'shows'
}

type FakeScan = (
  path: string,
  onProgress?: (progress: ScanProgress) => Effect.Effect<void>
) => Effect.Effect<ScanProgress, Error>

// Builds a ScanManager backed by stub Scanner/ShowScanner services and the
// in-memory test database, in place of the baked-in Scanner.Default /
// ShowScanner.Default via ScanManager.DefaultWithoutDependencies.
function makeManagerLayer(scanLibrary: FakeScan, scanShowLibrary: FakeScan) {
  const scannerStub = Layer.succeed(Scanner, {
    scanLibrary
  } as unknown as Scanner)
  const showScannerStub = Layer.succeed(ShowScanner, {
    scanShowLibrary
  } as unknown as ShowScanner)

  return ScanManager.DefaultWithoutDependencies.pipe(
    Layer.provide(scannerStub),
    Layer.provide(showScannerStub),
    Layer.provide(databaseTestLayer(testDb.db))
  )
}

const succeed =
  (progress: ScanProgress): FakeScan =>
  () =>
    Effect.succeed(progress)

function reset() {
  testDb.db.delete(testDb.schema.scanJobs).run()
  testDb.db.delete(testDb.schema.libraries).run()
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

beforeEach(() => {
  reset()
})

describe('ScanManager.start', () => {
  it('creates a scan_jobs row with status running and completes it as done', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const layer = makeManagerLayer(
      succeed({ added: 2, total: 5, updated: 1 }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        return yield* manager.start
      }).pipe(Effect.provide(layer))
    )

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

  it('returns already-running when a scan is in flight', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    let release: () => void = () => {
      // replaced before the Promise executor returns
    }

    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const layer = makeManagerLayer(
      () =>
        Effect.promise(async () => {
          await gate

          return { added: 0, total: 0, updated: 0 }
        }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const secondResult = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager
        const events = yield* manager.subscribe

        // Fork the first scan; it inserts the running job, emits scan-started,
        // then blocks in the gated scanLibrary.
        const firstFiber = yield* Effect.fork(manager.start)

        // Wait for scan-started so the running job exists before we probe.
        yield* Stream.runHead(Stream.take(events, 1))

        const second = yield* manager.start

        yield* Effect.sync(() => release())
        yield* Fiber.join(firstFiber)

        return second
      }).pipe(Effect.provide(layer), Effect.scoped)
    )

    expect(secondResult).toEqual({ status: 'already-running' })

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
  })

  it('returns no-libraries when there are none', async () => {
    const layer = makeManagerLayer(
      succeed({ added: 0, total: 0, updated: 0 }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        return yield* manager.start
      }).pipe(Effect.provide(layer))
    )

    expect(result).toEqual({
      status: 'no-libraries',
      message:
        'No libraries configured. Add a library in Settings before scanning.'
    })

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(0)
  })

  it('marks the job as error when a library scan fails', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const layer = makeManagerLayer(
      () => Effect.fail(new Error('disk on fire')),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        return yield* manager.start
      }).pipe(Effect.provide(layer))
    )

    expect(result.status).toEqual('error')

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
    expect(jobs[0]?.status).toEqual('error')
    expect(jobs[0]?.errorMessage).toEqual('Movies — disk on fire')
  })

  it('emits scan-started, library-start, file-scanned, library-complete, scan-complete', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const layer = makeManagerLayer(
      (_path, onProgress) =>
        Effect.gen(function* () {
          if (onProgress) {
            yield* onProgress({ added: 1, total: 1, updated: 0 })
          }

          return { added: 1, total: 1, updated: 0 }
        }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const tags = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager
        const events = yield* manager.subscribe

        const collector = yield* Effect.fork(
          Stream.runCollect(Stream.take(events, 5))
        )

        yield* manager.start

        const chunk = yield* Fiber.join(collector)

        return Chunk.toReadonlyArray(chunk).map(
          (event: ScanEvent) => event._tag
        )
      }).pipe(Effect.provide(layer), Effect.scoped)
    )

    expect(tags).toEqual([
      'scan-started',
      'library-start',
      'file-scanned',
      'library-complete',
      'scan-complete'
    ])
  })
})

describe('per-library results persistence', () => {
  it('stores a result entry per library, including errors', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })
    insertLibrary({ id: 2, name: 'Shows', path: '/shows', type: 'shows' })

    const layer = makeManagerLayer(
      succeed({ added: 2, total: 3, updated: 1 }),
      () => Effect.fail(new Error('folder gone'))
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        return yield* manager.start
      }).pipe(Effect.provide(layer))
    )

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

describe('ScanManager.getStatus', () => {
  it('reports idle with null lastJob when nothing has run', async () => {
    const layer = makeManagerLayer(
      succeed({ added: 0, total: 0, updated: 0 }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        return yield* manager.getStatus
      }).pipe(Effect.provide(layer))
    )

    expect(status).toEqual({
      isRunning: false,
      currentJob: null,
      lastJob: null
    })
  })

  it('reports the last completed job after a scan', async () => {
    insertLibrary({ id: 1, name: 'Movies', path: '/movies', type: 'movies' })

    const layer = makeManagerLayer(
      succeed({ added: 3, total: 7, updated: 0 }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const manager = yield* ScanManager

        yield* manager.start

        return yield* manager.getStatus
      }).pipe(Effect.provide(layer))
    )

    expect(status.isRunning).toEqual(false)
    expect(status.currentJob).toEqual(null)
    expect(status.lastJob?.status).toEqual('done')
    expect(status.lastJob?.added).toEqual(3)
    expect(status.lastJob?.total).toEqual(7)
  })
})

describe('ScanManager crash recovery', () => {
  it('marks jobs left in running state as error when the service builds', async () => {
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

    const layer = makeManagerLayer(
      succeed({ added: 0, total: 0, updated: 0 }),
      succeed({ added: 0, total: 0, updated: 0 })
    )

    // Building the service runs recoverInterruptedJobs in its scoped factory.
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* ScanManager
      }).pipe(Effect.provide(layer))
    )

    const jobs = await testDb.db.select().from(testDb.schema.scanJobs)

    expect(jobs.length).toEqual(1)
    expect(jobs[0]?.status).toEqual('error')
    expect(jobs[0]?.errorMessage).toEqual(
      'Server restarted mid-scan. Run a manual scan to resume.'
    )
    expect(jobs[0]?.endedAt).not.toEqual(null)
  })
})
