// Endpoints for uploaded documents (PDFs).
//
//   POST /api/documents        upload a PDF (form field "file")
//   GET  /api/documents        list documents, newest first
//   GET  /api/documents/:id    one document (the frontend polls this for status)
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { sendJson, HttpError, assertUuid } from '../lib/http.js'
import { readFormData } from '../lib/upload.js'
import { enqueueIngest } from '../services/ingest.js'

const MAX_FILENAME_LENGTH = 255

// Never send file_path to the browser: it's an internal detail of the server.
const DOCUMENT_COLUMNS = `
  id, filename, status, error, created_at AS "createdAt"`

// The same, plus how many chunks the document has (for the "Ready" badge).
const DOCUMENT_COLUMNS_WITH_COUNT = `${DOCUMENT_COLUMNS},
  (SELECT count(*)::int FROM chunks WHERE document_id = documents.id) AS "chunkCount"`

export async function uploadDocument(req, res) {
  const form = await readFormData(req)
  const file = form.get('file')

  if (!(file instanceof File)) {
    throw new HttpError(400, 'Attach the PDF in a form field named "file"')
  }
  if (file.size === 0) throw new HttpError(400, 'The file is empty')

  // The browser's type label is easy to fake, so we also check the content:
  // every PDF starts with the bytes "%PDF-".
  if (file.type !== 'application/pdf') {
    throw new HttpError(415, 'Only PDF files are supported') // 415 Unsupported Media Type
  }
  const data = Buffer.from(await file.arrayBuffer())
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new HttpError(415, 'This file is not a valid PDF')
  }

  // Store it under a random name. The user's file name is only kept in the
  // database for display — using it on disk could overwrite files or escape
  // the folder (e.g. a name like "../../server.js").
  const id = randomUUID()
  const filePath = path.join(config.uploadDir, `${id}.pdf`)
  const filename = path.basename(file.name || 'document.pdf').slice(0, MAX_FILENAME_LENGTH)

  await mkdir(config.uploadDir, { recursive: true })
  await writeFile(filePath, data)

  try {
    const { rows } = await pool.query(
      `INSERT INTO documents (id, filename, file_path) VALUES ($1, $2, $3)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [id, filename, filePath],
    )
    // Answer right away (status 'processing'). The slow part — reading the
    // text and creating embeddings — runs in the background. The browser
    // polls GET /api/documents/:id to see when it's 'ready'.
    sendJson(res, 201, rows[0])
    enqueueIngest(id) // no await: we don't wait for it
  } catch (err) {
    await unlink(filePath).catch(() => {}) // don't leave an orphan file behind
    throw err
  }
}

export async function listDocuments(req, res) {
  const { rows } = await pool.query(
    `SELECT ${DOCUMENT_COLUMNS_WITH_COUNT} FROM documents ORDER BY created_at DESC LIMIT 100`,
  )
  sendJson(res, 200, rows)
}

export async function getDocument(req, res, params) {
  assertUuid(params.id, 'Document')
  const { rows } = await pool.query(
    `SELECT ${DOCUMENT_COLUMNS_WITH_COUNT} FROM documents WHERE id = $1`,
    [params.id],
  )
  if (rows.length === 0) throw new HttpError(404, 'Document not found')
  sendJson(res, 200, rows[0])
}
