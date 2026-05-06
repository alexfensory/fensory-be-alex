import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10')
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

// Re-export schema for convenience
export * from './schema'
export * from './enums'
