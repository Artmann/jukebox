import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const movies = sqliteTable('movies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  extension: text('extension'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
