// Endpoints for uploaded documents (PDFs).
//
//   POST /api/documents        upload a PDF (form field "file")
//   GET  /api/documents        list documents, newest first
//   GET  /api/documents/:id    one document (the frontend polls this for status)
//   GET  /api/documents/:id/search?q=...&limit=5   find passages (no AI involved)
//   GET  /api/documents/:id/suggestions   starter questions (generated once, cached)
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { sendJson, HttpError, assertUuid, stripNul } from '../lib/http.js'
import { readFormData } from '../lib/upload.js'
import { enqueueIngest } from '../services/ingest.js'
import { findRelevantChunks, MIN_SCORE } from '../services/retrieval.js'
import { getSuggestedQuestions } from '../services/suggestions.js'

const MAX_QUERY_LENGTH = 500
const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 20

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
  const filename =
    path.basename(stripNul(file.name || '').trim() || 'document.pdf').slice(0, MAX_FILENAME_LENGTH)

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

// Search one document by meaning — the same retrieval that powers chat, but
// the matching passages are returned directly instead of going to Claude.
// Free and instant: only the local embedding model and the database are used.
export async function searchDocument(req, res, params, url) {
  assertUuid(params.id, 'Document')

  // Query-string values: /search?q=whale%20food&limit=3
  // url.searchParams decodes them for us (%20 → space, etc.).
  const query = (url.searchParams.get('q') ?? '').trim()
  if (!query) throw new HttpError(400, 'Add a search query, e.g. ?q=your+question')
  if (query.length > MAX_QUERY_LENGTH) {
    throw new HttpError(400, `Search query too long (max ${MAX_QUERY_LENGTH} characters)`)
  }

  const limitParam = url.searchParams.get('limit')
  let limit = DEFAULT_SEARCH_LIMIT
  if (limitParam !== null) {
    limit = Number(limitParam)
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw new HttpError(400, `"limit" must be a whole number from 1 to ${MAX_SEARCH_LIMIT}`)
    }
  }

  const { rows } = await pool.query(`SELECT status FROM documents WHERE id = $1`, [params.id])
  if (rows.length === 0) throw new HttpError(404, 'Document not found')
  if (rows[0].status !== 'ready') {
    throw new HttpError(409, 'This document is not ready to search yet')
  }

  const chunks = await findRelevantChunks(params.id, query, { topK: limit, minScore: MIN_SCORE })
  sendJson(res, 200, {
    query,
    results: chunks.map((c) => ({
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      score: Number(c.score.toFixed(3)),
      text: c.text,
    })),
  })
}

// Starter questions for an empty document chat (generated once, then cached).
export async function getDocumentSuggestions(req, res, params) {
  assertUuid(params.id, 'Document')
  const { rows } = await pool.query(
    `SELECT id, filename, status, suggested_questions FROM documents WHERE id = $1`,
    [params.id],
  )
  if (rows.length === 0) throw new HttpError(404, 'Document not found')
  if (rows[0].status !== 'ready') throw new HttpError(409, 'This document is not ready yet')

  sendJson(res, 200, { questions: await getSuggestedQuestions(rows[0]) })
}
