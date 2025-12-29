import { Hono } from 'hono'

const helloRoutes = new Hono()

helloRoutes.get('/', (c) => c.json({ message: 'Hello, world!', method: 'GET' }))
helloRoutes.put('/', (c) => c.json({ message: 'Hello, world!', method: 'PUT' }))
helloRoutes.get('/:name', (c) =>
  c.json({ message: `Hello, ${c.req.param('name')}!` })
)

export { helloRoutes }
