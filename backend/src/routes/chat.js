// POST /api/chat — streams Claude's reply back over Server-Sent Events.
//
// Request body:  { "messages": [{ "role": "user", "content": "Hi" }, ...] }
// Response:      data: {"text":"Hel"}\n\n  data: {"text":"lo"}\n\n  ...  data: [DONE]\n\n
import { readJson, HttpError } from '../lib/http.js'
import { startSSE, sendEvent, endSSE } from '../lib/sse.js'
import { streamReply } from '../services/llm.js'

const MAX_MESSAGES = 100

// Check the body before we start streaming. Once streaming starts we can no
// longer send a 400, so all validation has to happen up front.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, '"messages" must be a non-empty array')
  }
  if (messages.length > MAX_MESSAGES) {
    throw new HttpError(400, `Too many messages (max ${MAX_MESSAGES})`)
  }
  for (const m of messages) {
    if (m?.role !== 'user' && m?.role !== 'assistant') {
      throw new HttpError(400, 'Each message needs role "user" or "assistant"')
    }
    if (typeof m.content !== 'string' || !m.content.trim()) {
      throw new HttpError(400, 'Each message needs non-empty "content" text')
    }
  }
  if (messages.at(-1).role !== 'user') {
    throw new HttpError(400, 'The last message must be from the user')
  }
  // Keep only the two fields Claude needs; drop anything extra the client sent.
  return messages.map(({ role, content }) => ({ role, content }))
}

export async function chatHandler(req, res) {
  const body = await readJson(req)
  const messages = validateMessages(body.messages)

  // If the browser goes away (tab closed, Stop pressed), cancel the Claude request.
  // 'close' also fires after a normal finish, so only abort if we hadn't finished.
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) controller.abort()
  })

  startSSE(res)

  try {
    for await (const text of streamReply(messages, { signal: controller.signal })) {
      sendEvent(res, { text })
    }
    endSSE(res)
  } catch (err) {
    if (controller.signal.aborted) return // client left — nothing to send
    // Log just the message (it already includes the status code); the full
    // error object is very long.
    console.error('Claude stream failed:', err.message)
    // Headers are already sent, so we can't change the status code.
    // Instead, send the error as one more event and close.
    sendEvent(res, { error: 'The AI service failed to respond. Please try again.' })
    res.end()
  }
}
