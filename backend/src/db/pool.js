// One shared pool of database connections for the whole app.
//
// Opening a connection to Postgres is slow, so a pool opens a few and reuses
// them: pool.query(...) borrows a free connection, runs the query, gives it back.
import pg from 'pg'
import pgvector from 'pgvector'
import { config } from '../config.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl })

// A connection that breaks while idle (e.g. the database restarted) emits an
// error. Log it instead of letting it crash the server; the pool replaces it.
pool.on('error', (err) => {
  console.error('Database connection error:', err.message)
})

/**
 * Run several queries as ONE unit: either all of them succeed, or none do.
 *
 *   await withTransaction(async (client) => {
 *     await client.query('UPDATE ...')
 *     await client.query('INSERT ...')
 *   })
 *
 * All queries must use the `client` passed in (the same connection), because a
 * transaction belongs to one connection. If fn throws, everything is undone.
 */
export async function withTransaction(fn) {
  const client = await pool.connect() // borrow one connection from the pool
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT') // make all changes permanent
    return result
  } catch (err) {
    await client.query('ROLLBACK') // undo everything since BEGIN
    throw err
  } finally {
    client.release() // always give the connection back
  }
}

/**
 * Call once at startup, before handling requests.
 *
 * Postgres sends `vector` columns as text like "[0.1,0.2,...]". We look up the
 * vector type's id (OID) once and tell `pg` to turn that text into a JavaScript
 * array for every connection. Doing it once, globally, avoids a race where a
 * query runs on a new connection before its types were registered.
 */
export async function initDb() {
  const { rows } = await pool.query(`SELECT oid FROM pg_type WHERE typname = 'vector'`)
  if (rows.length === 0) {
    throw new Error('The pgvector extension is missing. Run: npm run migrate')
  }
  pg.types.setTypeParser(rows[0].oid, pgvector.fromSql)
}
