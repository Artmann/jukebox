import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { db, schema } from '../../database'
import { scanLibrary } from '../../services/scanner'
import { scanShowLibrary } from '../../services/show-scanner'

const scanRoutes = new Hono()

scanRoutes.get('/libraries', async (context) => {
  const libraries = await db.select().from(schema.libraries)

  return context.json(
    libraries.map((library) => ({
      id: library.id,
      name: library.name,
      path: library.path,
      type: library.type
    }))
  )
})

scanRoutes.get('/stream', async (context) => {
  const libraries = await db.select().from(schema.libraries)

  if (libraries.length === 0) {
    return context.json({ error: { message: 'No libraries configured' } }, 400)
  }

  return streamSSE(context, async (stream) => {
    let totalAdded = 0
    let totalUpdated = 0
    let totalFound = 0

    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i]

      if (!library) {
        continue
      }

      await stream.writeSSE({
        event: 'library-start',
        data: JSON.stringify({ index: i })
      })

      try {
        const onProgress = async (progress: {
          added: number
          total: number
          updated: number
        }) => {
          await stream.writeSSE({
            event: 'file-scanned',
            data: JSON.stringify({ index: i, ...progress })
          })
        }

        let result: { added: number; total: number; updated: number }

        if (library.type === 'movies') {
          result = await scanLibrary(library.path, onProgress)
        } else {
          result = await scanShowLibrary(library.path, onProgress)
        }

        totalAdded += result.added
        totalUpdated += result.updated
        totalFound += result.total

        await stream.writeSSE({
          event: 'library-complete',
          data: JSON.stringify({
            added: result.added,
            index: i,
            total: result.total,
            updated: result.updated
          })
        })
      } catch (error) {
        await stream.writeSSE({
          event: 'library-error',
          data: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            index: i
          })
        })
      }
    }

    await stream.writeSSE({
      event: 'scan-complete',
      data: JSON.stringify({
        added: totalAdded,
        found: totalFound,
        updated: totalUpdated
      })
    })
  })
})

export { scanRoutes }
