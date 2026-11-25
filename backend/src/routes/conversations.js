// Endpoints for chats (conversations) and their messages.
//
//   POST   /api/conversations                create a chat
//   GET    /api/conversations                list chats, most recent first
//   GET    /api/conversations/:id/messages   one chat + all its messages
//   DELETE /api/conversations/:id            delete a chat (and its messages)
import { pool } from '../db/pool.js'
import { readJson, sendJson, HttpError, assertUuid } from '../lib/http.js'

const MAX_TITLE_LENGTH = 100

// The columns we send to the browser. `AS "documentId"` renames snake_case
// database columns to the camelCase names JavaScript code expects.
const CONVERSATION_COLUMNS = `
  id, title, document_id AS "documentId",
  created_at AS "createdAt", updated_at AS "updatedAt"`

export async function createConversation(req, res) {
  const body = await readJson(req)

  let title = 'New chat'
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new HttpError(400, '"title" must be non-empty text')
    }
    title = body.title.trim().slice(0, MAX_TITLE_LENGTH)
  }

  const { rows } = await pool.query(
    `INSERT INTO conversations (title) VALUES ($1) RETURNING ${CONVERSATION_COLUMNS}`,
    [title],
  )
  sendJson(res, 201, rows[0]) // 201 Created
}

export async function listConversations(req, res) {
  const { rows } = await pool.query(
    `SELECT ${CONVERSATION_COLUMNS} FROM conversations ORDER BY updated_at DESC LIMIT 100`,
  )
  sendJson(res, 200, rows)
}

export async function getConversationMessages(req, res, params) {
  assertUuid(params.id, 'Conversation')

  const conv = await pool.query(
    `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`,
    [params.id],
  )
  if (conv.rows.length === 0) throw new HttpError(404, 'Conversation not found')

  // ORDER BY id: ids count up, so this is the exact order messages were saved.
  const { rows: messages } = await pool.query(
    `SELECT id, role, content, created_at AS "createdAt"
       FROM messages WHERE conversation_id = $1
      ORDER BY id`,
    [params.id],
  )
  sendJson(res, 200, { conversation: conv.rows[0], messages })
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
