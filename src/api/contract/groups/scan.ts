import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

import { BadRequestWire } from '../errors'
import { AuthMiddleware, ProfileMiddleware } from '../middleware'
import { Library, ScanStatus } from '../schemas'

export const StartScanResponse = Schema.Struct({
  status: Schema.Literal('started', 'already-running')
})

export type StartScanResponse = typeof StartScanResponse.Type

// GET /scan/stream (SSE) is intentionally absent — it stays a raw
// HttpApiBuilder.Router route in Phase 6.
export const scanGroup = HttpApiGroup.make('scan')
  .middleware(ProfileMiddleware)
  .middleware(AuthMiddleware)
  .add(
    HttpApiEndpoint.get('listLibraries', '/scan/libraries').addSuccess(
      Schema.Array(Library)
    )
  )
  .add(HttpApiEndpoint.get('getStatus', '/scan/status').addSuccess(ScanStatus))
  .add(
    HttpApiEndpoint.post('startScan', '/scan/start')
      .addSuccess(StartScanResponse)
      .addError(BadRequestWire)
  )
