// Creates the database tables by running schema.sql.   Usage: npm run migrate
//
// It uses a single plain client (not the pool) because the pool registers the
// `vector` type on connect, and that type doesn't exist until this script has
// run `CREATE EXTENSION vector`.
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { config } from '../config.js'

const schemaPath = new URL('./schema.sql', import.meta.url) // the file next to this one
const sql = await readFile(schemaPath, 'utf8')

const client = new pg.Client({ connectionString: config.databaseUrl })

try {
  await client.connect()
  await client.query(sql) // one call can run many statements
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  )
  console.log('✅ Migration complete. Tables:', rows.map((r) => r.table_name).join(', '))
} catch (err) {
  console.error('❌ Migration failed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
