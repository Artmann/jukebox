import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

// Every error crosses the wire as `{ error: { message } }` (some with extra
// fields inside `error`) to stay byte-compatible with today's Hono responses.
// The default TaggedError encoding would leak `_tag`, so each catalog entry
// pairs a TaggedError class (the Effect side handlers fail with) with a
// transform to the wire struct, annotated with the HTTP status.

const messageWire = Schema.Struct({
  error: Schema.Struct({ message: Schema.String })
})

const errorWire = <Error, Tag extends string>(
  errorSchema: Schema.Schema<
    Error,
    { readonly _tag: Tag; readonly message: string },
    never
  >,
  tag: Tag,
  status: number
): Schema.Schema<Error, typeof messageWire.Encoded, never> =>
  Schema.transform(messageWire, errorSchema, {
    decode: (wire) => ({ _tag: tag, message: wire.error.message }),
    encode: (error) => ({ error: { message: error.message } }),
    strict: true
  }).annotations(HttpApiSchema.annotations({ status }))

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  'BadRequest',
  { message: Schema.String }
) {}

export class Conflict extends Schema.TaggedError<Conflict>()('Conflict', {
  message: Schema.String
}) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()('Forbidden', {
  message: Schema.String
}) {}

export class InternalError extends Schema.TaggedError<InternalError>()(
  'InternalError',
  { message: Schema.String }
) {}

export class LibraryInUse extends Schema.TaggedError<LibraryInUse>()(
  'LibraryInUse',
  {
    message: Schema.String,
    referenceCount: Schema.Number
  }
) {}

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
  message: Schema.String
}) {}

// Today's POST /api/setup/complete returns field errors as an ARRAY of
// `{ index, message }` rows (one per invalid library entry), matching
// src/api/routes/setup.ts.
export const SetupFieldError = Schema.Struct({
  index: Schema.Number,
  message: Schema.String
})

export type SetupFieldError = typeof SetupFieldError.Type

export class SetupValidationError extends Schema.TaggedError<SetupValidationError>()(
  'SetupValidationError',
  {
    fieldErrors: Schema.Array(SetupFieldError),
    message: Schema.String
  }
) {}

export class TooManyRequests extends Schema.TaggedError<TooManyRequests>()(
  'TooManyRequests',
  { message: Schema.String }
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { message: Schema.String }
) {}

export class UnsupportedMediaType extends Schema.TaggedError<UnsupportedMediaType>()(
  'UnsupportedMediaType',
  { message: Schema.String }
) {}

export const BadRequestWire = errorWire(BadRequest, 'BadRequest', 400)

export const ConflictWire = errorWire(Conflict, 'Conflict', 409)

export const ForbiddenWire = errorWire(Forbidden, 'Forbidden', 403)

export const InternalErrorWire = errorWire(InternalError, 'InternalError', 500)

export const LibraryInUseWire = Schema.transform(
  Schema.Struct({
    error: Schema.Struct({
      message: Schema.String,
      referenceCount: Schema.Number
    })
  }),
  LibraryInUse,
  {
    decode: (wire) => ({
      _tag: 'LibraryInUse' as const,
      message: wire.error.message,
      referenceCount: wire.error.referenceCount
    }),
    encode: (error) => ({
      error: {
        message: error.message,
        referenceCount: error.referenceCount
      }
    }),
    strict: true
  }
).annotations(HttpApiSchema.annotations({ status: 409 }))

export const NotFoundWire = errorWire(NotFound, 'NotFound', 404)

export const SetupValidationErrorWire = Schema.transform(
  Schema.Struct({
    error: Schema.Struct({
      fieldErrors: Schema.Array(SetupFieldError),
      message: Schema.String
    })
  }),
  SetupValidationError,
  {
    decode: (wire) => ({
      _tag: 'SetupValidationError' as const,
      fieldErrors: wire.error.fieldErrors,
      message: wire.error.message
    }),
    encode: (error) => ({
      error: {
        fieldErrors: error.fieldErrors,
        message: error.message
      }
    }),
    strict: true
  }
).annotations(HttpApiSchema.annotations({ status: 400 }))

export const TooManyRequestsWire = errorWire(
  TooManyRequests,
  'TooManyRequests',
  429
)

export const UnauthorizedWire = errorWire(Unauthorized, 'Unauthorized', 401)

export const UnsupportedMediaTypeWire = errorWire(
  UnsupportedMediaType,
  'UnsupportedMediaType',
  415
)
