import { defineConfig } from 'drizzle-kit'

import { telemetryDatabasePath } from './src/telemetry/config'

// The telemetry database has its own schema, migrations folder, and file,
// separate from the main jukebox.db config in drizzle.config.ts.
export default defineConfig({
  schema: './src/telemetry/schema.ts',
  out: './drizzle-telemetry',
  dialect: 'sqlite',
  dbCredentials: {
    url: telemetryDatabasePath
  }
})
