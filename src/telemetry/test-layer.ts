// @vitest-environment node
import { Layer } from 'effect'

import { telemetryDatabaseTestLayer } from './layer'
import { TelemetrySettings } from './settings'
import { createTelemetryTestDatabase } from './test-database'
import { TelemetryWriter } from './writer'

// Provides the three telemetry services (TelemetryDatabase, TelemetrySettings,
// TelemetryWriter) backed by an in-memory telemetry database, for tests whose
// app layer now includes the telemetry handler group. It still requires the
// main Database (which TelemetrySettings reads) — tests provide that via
// databaseTestLayer. The wire tests don't exercise the telemetry endpoints;
// this just lets the app layer build.
const telemetryDatabase = createTelemetryTestDatabase().db

export const telemetryTestLayer = Layer.mergeAll(
  TelemetrySettings.Default,
  TelemetryWriter.Default.pipe(Layer.provide(TelemetrySettings.Default))
).pipe(Layer.provideMerge(telemetryDatabaseTestLayer(telemetryDatabase)))
