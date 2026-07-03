import { Effect, Layer } from 'effect'

// Declared like `src/database/index.ts` so the Node build (vitest, tsc) never
// depends on Bun's ambient global types.
declare const Bun: unknown

const port = process.env.PORT ? Number(process.env.PORT) : 1990

// The HTTP server must run under both Node (tsx dev, `node dist/server/index.js`)
// and Bun (`bun build --compile` executables), so we pick the platform layer at
// runtime. Each branch uses a literal import specifier — never a variable one —
// so `bun build --compile` can statically discover both modules. A variable
// specifier once shipped a broken 0.5.2 executable that crashed on boot.
//
// The merged layer provides the running HTTP server plus the platform context
// (FileSystem, Path, CommandExecutor) that later phases depend on.
export const HttpServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    if (typeof Bun !== 'undefined') {
      const { BunContext, BunHttpServer } = yield* Effect.promise(
        () => import('@effect/platform-bun')
      )

      return Layer.merge(BunHttpServer.layer({ port }), BunContext.layer)
    }

    const [{ createServer }, { NodeContext, NodeHttpServer }] =
      yield* Effect.promise(() =>
        Promise.all([import('node:http'), import('@effect/platform-node')])
      )

    return Layer.merge(
      NodeHttpServer.layer(() => createServer(), { port }),
      NodeContext.layer
    )
  })
)
