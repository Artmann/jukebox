import { defineConfig } from 'drizzle-kit'

import { databasePath } from './src/config'

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: databasePath
  }
})
