// POST /api/chat — saves your message, streams Claude's reply over SSE, then
// saves the reply too. If the chat is linked to a document, the reply is based
// on the most relevant parts of that document (RAG), with page citations.
//
// Request body:  { "conversationId": "<uuid>", "content": "What is SSE?" }
// Response:      data: {"text":"Hel"}\n\n  ...  data: {"sources":[...]}\n\n  data: [DONE]\n\n
import { pool, withTransaction } from '../db/pool.js'
import { readJson, HttpError, assertUuid } from '../lib/http.js'
import { startSSE, sendEvent, endSSE } from '../lib/sse.js'
import { streamReply } from '../services/llm.js'
import { findRelevantChunks, MIN_SCORE } from '../services/retrieval.js'
import { buildRagUserMessage, toSources, RAG_SYSTEM_PROMPT } from '../services/ragPrompt.js'

const MAX_CONTENT_LENGTH = 20_000 // characters in one message
const MAX_HISTORY_MESSAGES = 40 // how many recent messages Claude sees (normal chats)
// Document chats: the new question + the last 6 messages. The excerpts already
// carry the facts, so a short history keeps the prompt small and focused.
const MAX_HISTORY_MESSAGES_RAG = 7
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

// The chat, plus its linked document (if any) and that document's status.
async function loadConversation(conversationId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.document_id AS "documentId", d.filename AS "documentName", d.status AS "documentStatus"
       FROM conversations c
       LEFT JOIN documents d ON d.id = c.document_id
      WHERE c.id = $1`,
    [conversationId],
  )
  if (rows.length === 0) throw new HttpError(404, 'Conversation not found')
  return rows[0]
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
async function loadHistory(conversationId, limit) {
  const { rows } = await pool.query(
    `SELECT role, content FROM (
       SELECT id, role, content FROM messages
        WHERE conversation_id = $1
        ORDER BY id DESC
        LIMIT $2
     ) AS recent
     ORDER BY id`,
    [conversationId, limit],
  )
  // Cutting the history can leave an assistant message first, but Claude
  // expects the conversation to start with the user.
  while (rows.length > 0 && rows[0].role !== 'user') rows.shift()
  return rows
}

async function saveAssistantMessage(conversationId, content, sources) {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1, 'assistant', $2, $3)`,
      [conversationId, content, sources ? JSON.stringify(sources) : null],
    )
    await client.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [
      conversationId,
    ])
  })
}

/**
 * Build what we send to Claude. For a document chat, the last message (the
 * new question) is replaced by "excerpts + question", and the RAG rules are
 * used as the system prompt.
 */
async function buildPrompt(conversation, content) {
  if (!conversation.documentId) {
    return { messages: await loadHistory(conversation.id, MAX_HISTORY_MESSAGES), sources: null }
  }

  const history = await loadHistory(conversation.id, MAX_HISTORY_MESSAGES_RAG)
  const chunks = await findRelevantChunks(conversation.documentId, content, { minScore: MIN_SCORE })

  history[history.length - 1] = {
    role: 'user',
    content: buildRagUserMessage(conversation.documentName, chunks, content),
  }
  return { messages: history, system: RAG_SYSTEM_PROMPT, sources: toSources(chunks) }
}

export async function chatHandler(req, res) {
  const { conversationId, content } = validateBody(await readJson(req))

  const conversation = await loadConversation(conversationId) // 404 if missing
  if (conversation.documentId && conversation.documentStatus !== 'ready') {
    const why =
      conversation.documentStatus === 'failed'
        ? 'This chat’s document could not be processed.'
        : 'This chat’s document is still being processed. Please wait a moment.'
    throw new HttpError(409, why) // 409 Conflict: not possible in the current state
  }

  await saveUserMessage(conversationId, content)
  const { messages, system, sources } = await buildPrompt(conversation, content)

  // If the browser goes away (tab closed, Stop pressed), cancel the Claude request.
  // 'close' also fires after a normal finish, so only abort if we hadn't finished.
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) controller.abort()
  })

  startSSE(res)

  let reply = '' // everything streamed so far
  try {
    for await (const text of streamReply(messages, { signal: controller.signal, system })) {
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

  // The pages the answer was based on, for the citations under it.
  if (sources?.length && !res.writableEnded) sendEvent(res, { sources })

  // Save whatever the user saw — the full reply, or the part before Stop.
  // This runs even if the browser has already gone away.
  if (reply.trim()) {
    try {
      await saveAssistantMessage(conversationId, reply, sources?.length ? sources : null)
    } catch (err) {
      console.error('Could not save assistant message:', err.message)
    }
  }

  if (!res.writableEnded) endSSE(res)
}
