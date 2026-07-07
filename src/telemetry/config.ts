import { join } from 'path'

import { configDirectory } from '../config'

// The telemetry database is deliberately a separate SQLite file from the main
// jukebox.db: traces and errors are high-churn, short-lived data, so keeping
// them apart means a retention purge (or a corrupt telemetry file) never
// touches the library data. It still lives under the same ~/.jukebox directory.
export const telemetryDatabasePath = join(configDirectory, 'telemetry.db')
