// The background job that makes an uploaded PDF searchable:
//
//   read file → extract text per page → chunk → embed → save chunks → status 'ready'
//
// If anything goes wrong, the document's status becomes 'failed' with a reason
// the user can understand.
import { readFile } from 'node:fs/promises'
import pgvector from 'pgvector'
import { pool, withTransaction } from '../db/pool.js'
import { extractPages, chunkPages } from './parser.js'
import { embedTexts } from './embeddings.js'

const MAX_CHUNKS = 5000 // ~4 MB of text — roughly a 1,500-page book
const INSERT_BATCH_SIZE = 500 // rows per INSERT statement

// An error whose message is safe and useful to show the user.
class IngestError extends Error {}

// ---- A tiny job queue -------------------------------------------------------
// Embedding is heavy on CPU and memory, so we process ONE document at a time.
// Each new job is chained onto the end of the previous one.
let queue = Promise.resolve()

/** Add a document to the queue. Returns immediately; the work happens later. */
export function enqueueIngest(documentId) {
  queue = queue.then(() => ingestDocument(documentId))
}

/**
 * After a restart, documents that were 'processing' when the server stopped
 * would stay that way forever. Put them back in the queue.
 */
export async function resumePendingIngests() {
  const { rows } = await pool.query(
    `SELECT id FROM documents WHERE status = 'processing' ORDER BY created_at`,
  )
  for (const { id } of rows) enqueueIngest(id)
  if (rows.length > 0) console.log(`Resuming processing of ${rows.length} document(s)`)
}

// ---- The job itself -----------------------------------------------------------

/** Process one document. Never throws: failures are saved on the document. */
export async function ingestDocument(documentId) {
  const started = Date.now()
  try {
    const { rows } = await pool.query(`SELECT file_path FROM documents WHERE id = $1`, [
      documentId,
    ])
    if (rows.length === 0) return // deleted before we got to it

    const pages = await readPdfPages(rows[0].file_path)
    const chunks = chunkPages(pages)
    if (chunks.length === 0) {
      throw new IngestError(
        'No text found in this PDF. Scanned documents (photos of pages) are not supported yet.',
      )
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new IngestError(`This PDF is too long (over ${MAX_CHUNKS} text chunks).`)
    }

    const embeddings = await embedTexts(chunks.map((c) => c.text))
    await saveChunks(documentId, chunks, embeddings)

    console.log(
      `Document ${documentId} ready: ${pages.length} pages, ${chunks.length} chunks, ${Date.now() - started} ms`,
    )
  } catch (err) {
    const reason = err instanceof IngestError ? err.message : 'Processing failed. Please try again.'
    if (!(err instanceof IngestError)) console.error(`Ingest of ${documentId} failed:`, err)
    await pool
      .query(`UPDATE documents SET status = 'failed', error = $2 WHERE id = $1`, [documentId, reason])
      .catch((e) => console.error('Could not mark document as failed:', e.message))
  }
}

// Read the PDF and turn PDF.js's technical errors into friendly ones.
async function readPdfPages(filePath) {
  try {
    return await extractPages(await readFile(filePath))
  } catch (err) {
    if (err.name === 'PasswordException') {
      throw new IngestError('This PDF is password-protected. Please upload an unlocked copy.')
    }
    if (err.name === 'InvalidPDFException') {
      throw new IngestError('This PDF is damaged or not a valid PDF.')
    }
    if (err.code === 'ENOENT') throw new IngestError('The uploaded file is missing.')
    throw err
  }
}

// Save all chunks and mark the document ready — in one transaction, so a
// document is never 'ready' with only half of its chunks.
async function saveChunks(documentId, chunks, embeddings) {
  await withTransaction(async (client) => {
    // Remove chunks from an earlier, interrupted attempt (makes retries safe).
    await client.query(`DELETE FROM chunks WHERE document_id = $1`, [documentId])

    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE)
      const batchEmbeddings = embeddings.slice(i, i + INSERT_BATCH_SIZE)

      // One INSERT for many rows: send one array per column, and unnest()
      // turns the arrays back into rows. Much faster than 500 separate INSERTs.
      await client.query(
        `INSERT INTO chunks (document_id, page_number, chunk_index, text, embedding)
         SELECT $1, page_number, chunk_index, text, embedding::vector
           FROM unnest($2::int[], $3::int[], $4::text[], $5::text[])
                AS t(page_number, chunk_index, text, embedding)`,
        [
          documentId,
          batch.map((c) => c.pageNumber),
          batch.map((c) => c.chunkIndex),
          batch.map((c) => c.text),
          batchEmbeddings.map((e) => pgvector.toSql(e)), // [0.1, ...] → '[0.1,...]'
        ],
      )
    }

    await client.query(`UPDATE documents SET status = 'ready', error = NULL WHERE id = $1`, [
      documentId,
    ])
  })
}
