import { FetchHttpClient, HttpApiClient, HttpClientError } from '@effect/platform'
import { Effect, Either, ManagedRuntime } from 'effect'

import { jukeboxApi, type SetupFieldError } from '../../api/contract'

/**
 * A typed API failure: the server answered with one of the contract's tagged
 * errors (or an unexpected status). Transport failures (server unreachable)
 * are thrown as plain Errors instead, so `error instanceof ApiError` tells
 * "the server said no" apart from "the server never answered".
 */
export class ApiError extends Error {
  readonly fieldErrors: ReadonlyArray<SetupFieldError>
  readonly referenceCount: number | undefined
  readonly status: number

  constructor(options: {
    fieldErrors?: ReadonlyArray<SetupFieldError>
    message: string
    referenceCount?: number
    status: number
  }) {
    super(options.message)

    this.fieldErrors = options.fieldErrors ?? []
    this.name = 'ApiError'
    this.referenceCount = options.referenceCount
    this.status = options.status
  }
}

export const unreachableServerMessage =
  "Couldn't reach server. Check your connection."

// The HTTP status each contract error crosses the wire with, mirroring the
// HttpApiSchema.annotations({ status }) in src/api/contract/errors.ts.
const statusByTag: Record<string, number> = {
  BadRequest: 400,
  Conflict: 409,
  Forbidden: 403,
  InternalError: 500,
  LibraryInUse: 409,
  NotFound: 404,
  SetupValidationError: 400,
  TooManyRequests: 429,
  Unauthorized: 401,
  UnsupportedMediaType: 415
}

interface ContractFailure {
  readonly _tag: string
  readonly fieldErrors?: ReadonlyArray<SetupFieldError>
  readonly message: string
  readonly referenceCount?: number
}

function isContractFailure(failure: unknown): failure is ContractFailure {
  if (typeof failure !== 'object' || failure === null) {
    return false
  }

  const tag = (failure as { _tag?: unknown })._tag

  return typeof tag === 'string' && tag in statusByTag
}

function toThrownError(failure: unknown): Error {
  if (isContractFailure(failure)) {
    return new ApiError({
      fieldErrors: failure.fieldErrors,
      message: failure.message,
      referenceCount: failure.referenceCount,
      status: statusByTag[failure._tag] ?? 500
    })
  }

  // The server answered, but with a status the contract doesn't document.
  if (failure instanceof HttpClientError.ResponseError) {
    return new ApiError({
      message: `The server returned an unexpected response (status ${failure.response.status}). Try again.`,
      status: failure.response.status
    })
  }

  // The request never got an answer (offline, server down, CORS, ...).
  if (failure instanceof HttpClientError.RequestError) {
    return new Error(unreachableServerMessage)
  }

  if (failure instanceof Error) {
    return failure
  }

  return new Error('Something went wrong talking to the server. Try again.')
}

const runtime = ManagedRuntime.make(FetchHttpClient.layer)

// The contract already carries the /api prefix, so the base URL is just the
// page's origin — in dev that is the Vite server, which proxies /api to the
// API server, exactly like the relative fetches did before.
const client = runtime.runSync(
  HttpApiClient.make(jukeboxApi, { baseUrl: window.location.origin })
)

export type JukeboxApiClient = typeof client

/**
 * Run one typed API call and hand back a plain Promise for React Query.
 * Failures are normalized by toThrownError above so hooks keep receiving
 * Error instances with a useful, user-facing message.
 */
export async function api<Result>(
  call: (apiClient: JukeboxApiClient) => Effect.Effect<Result, unknown>
): Promise<Result> {
  const result = await runtime.runPromise(Effect.either(call(client)))

  if (Either.isLeft(result)) {
    throw toThrownError(result.left)
  }

  return result.right
}
