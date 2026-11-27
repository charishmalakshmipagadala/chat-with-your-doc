// Endpoints for chats (conversations) and their messages.
//
//   POST   /api/conversations                create a chat (optionally about a document)
//   GET    /api/conversations                list chats, most recent first
//   GET    /api/conversations/:id/messages   one chat + all its messages
//   DELETE /api/conversations/:id            delete a chat (and its messages)
import { pool } from '../db/pool.js'
import { readJson, sendJson, HttpError, assertUuid, stripNul } from '../lib/http.js'

const MAX_TITLE_LENGTH = 100

// The columns we send to the browser. `AS "documentId"` renames snake_case
// database columns to the camelCase names JavaScript code expects.
// LEFT JOIN: also get the linked document's name — or NULL if there is none.
const SELECT_CONVERSATIONS = `
  SELECT c.id, c.title, c.document_id AS "documentId", d.filename AS "documentName",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt"
    FROM conversations c
    LEFT JOIN documents d ON d.id = c.document_id`

async function findConversation(id) {
  const { rows } = await pool.query(`${SELECT_CONVERSATIONS} WHERE c.id = $1`, [id])
  return rows[0] ?? null
}

export async function createConversation(req, res) {
  const body = await readJson(req)

  let title = 'New chat'
  if (body.title !== undefined) {
    const clean = typeof body.title === 'string' ? stripNul(body.title).trim() : ''
    if (!clean) throw new HttpError(400, '"title" must be non-empty text')
    title = clean.slice(0, MAX_TITLE_LENGTH)
  }

  // Optional: link the chat to an uploaded document ("chat with this PDF").
  let documentId = null
  if (body.documentId !== undefined && body.documentId !== null) {
    if (typeof body.documentId !== 'string') throw new HttpError(400, '"documentId" must be text')
    assertUuid(body.documentId, 'Document')
    const doc = await pool.query(`SELECT 1 FROM documents WHERE id = $1`, [body.documentId])
    if (doc.rowCount === 0) throw new HttpError(404, 'Document not found')
    documentId = body.documentId
  }

  const { rows } = await pool.query(
    `INSERT INTO conversations (title, document_id) VALUES ($1, $2) RETURNING id`,
    [title, documentId],
  )
  sendJson(res, 201, await findConversation(rows[0].id)) // 201 Created
}

export async function listConversations(req, res) {
  const { rows } = await pool.query(`${SELECT_CONVERSATIONS} ORDER BY c.updated_at DESC LIMIT 100`)
  sendJson(res, 200, rows)
}

export async function getConversationMessages(req, res, params) {
  assertUuid(params.id, 'Conversation')

  const conversation = await findConversation(params.id)
  if (!conversation) throw new HttpError(404, 'Conversation not found')

  // ORDER BY id: ids count up, so this is the exact order messages were saved.
  const { rows: messages } = await pool.query(
    `SELECT id, role, content, sources, created_at AS "createdAt"
       FROM messages WHERE conversation_id = $1
      ORDER BY id`,
    [params.id],
  )
  sendJson(res, 200, { conversation, messages })
}

export async function deleteConversation(req, res, params) {
  assertUuid(params.id, 'Conversation')

  // rowCount = how many rows were deleted (0 means there was no such chat).
  // Its messages are removed automatically (ON DELETE CASCADE).
  const { rowCount } = await pool.query(`DELETE FROM conversations WHERE id = $1`, [params.id])
  if (rowCount === 0) throw new HttpError(404, 'Conversation not found')

  res.writeHead(204) // 204 No Content: success, nothing to send back
  res.end()
}
