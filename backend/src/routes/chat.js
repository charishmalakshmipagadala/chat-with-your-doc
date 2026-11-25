// POST /api/chat — saves your message, streams Claude's reply over SSE, then
// saves the reply too.
//
// Request body:  { "conversationId": "<uuid>", "content": "What is SSE?" }
// Response:      data: {"text":"Hel"}\n\n  data: {"text":"lo"}\n\n  ...  data: [DONE]\n\n
import { pool, withTransaction } from '../db/pool.js'
import { readJson, HttpError, assertUuid } from '../lib/http.js'
import { startSSE, sendEvent, endSSE } from '../lib/sse.js'
import { streamReply } from '../services/llm.js'

const MAX_CONTENT_LENGTH = 20_000 // characters in one message
const MAX_HISTORY_MESSAGES = 40 // how many recent messages Claude sees
const TITLE_LENGTH = 40

// Check the body before we start streaming. Once streaming starts we can no
// longer send a 400, so all validation has to happen up front.
function validateBody(body) {
  if (typeof body.conversationId !== 'string') {
    throw new HttpError(400, '"conversationId" is required')
  }
  assertUuid(body.conversationId, 'Conversation')

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) throw new HttpError(400, '"content" must be non-empty text')
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new HttpError(400, `Message too long (max ${MAX_CONTENT_LENGTH} characters)`)
  }
  return { conversationId: body.conversationId, content }
}

// Save the user's message. If it's the chat's first message, it also becomes
// the chat's title. Both changes happen in one transaction: all or nothing.
async function saveUserMessage(conversationId, content) {
  const title = content.replace(/\s+/g, ' ').slice(0, TITLE_LENGTH)

  await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE conversations
          SET updated_at = now(),
              title = CASE
                WHEN NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = $1) THEN $2
                ELSE title
              END
        WHERE id = $1`,
      [conversationId, title],
    )
    if (rowCount === 0) throw new HttpError(404, 'Conversation not found') // → ROLLBACK

    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [conversationId, content],
    )
  })
}

// The most recent messages, oldest first — what Claude needs to see.
async function loadHistory(conversationId) {
  const { rows } = await pool.query(
    `SELECT role, content FROM (
       SELECT id, role, content FROM messages
        WHERE conversation_id = $1
        ORDER BY id DESC
        LIMIT $2
     ) AS recent
     ORDER BY id`,
    [conversationId, MAX_HISTORY_MESSAGES],
  )
  // Cutting the history can leave an assistant message first, but Claude
  // expects the conversation to start with the user.
  while (rows.length > 0 && rows[0].role !== 'user') rows.shift()
  return rows
}

async function saveAssistantMessage(conversationId, content) {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [conversationId, content],
    )
    await client.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [
      conversationId,
    ])
  })
}

export async function chatHandler(req, res) {
  const { conversationId, content } = validateBody(await readJson(req))

  await saveUserMessage(conversationId, content) // 404 here if the chat doesn't exist
  const history = await loadHistory(conversationId)

  // If the browser goes away (tab closed, Stop pressed), cancel the Claude request.
  // 'close' also fires after a normal finish, so only abort if we hadn't finished.
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) controller.abort()
  })

  startSSE(res)

  let reply = '' // everything streamed so far
  try {
    for await (const text of streamReply(history, { signal: controller.signal })) {
      reply += text
      sendEvent(res, { text })
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      // Log just the message (it already includes the status code).
      console.error('Claude stream failed:', err.message)
      // Headers are already sent, so we can't change the status code.
      // Instead, send the error as one more event.
      sendEvent(res, { error: 'The AI service failed to respond. Please try again.' })
    }
  }

  // Save whatever the user saw — the full reply, or the part before Stop.
  // This runs even if the browser has already gone away.
  if (reply.trim()) {
    try {
      await saveAssistantMessage(conversationId, reply)
    } catch (err) {
      console.error('Could not save assistant message:', err.message)
    }
  }

  if (!res.writableEnded) endSSE(res)
}
