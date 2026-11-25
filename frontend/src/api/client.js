// Every call to the backend goes through this file.
// URLs start with /api — in development Vite forwards them to the Node server.

// One helper for all normal (non-streaming) JSON requests.
// Turns any error response into a thrown Error carrying the server's message.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json() // 204 No Content has no body
}

// ---- Conversations ----------------------------------------------------------

/** @returns {Promise<{ id, title, documentId, createdAt, updatedAt }[]>} newest first */
export const listConversations = () => request('/api/conversations')

export const createConversation = () => request('/api/conversations', { method: 'POST', body: {} })

/** @returns {Promise<{ conversation, messages: { id, role, content }[] }>} */
export const getConversation = (id) => request(`/api/conversations/${id}/messages`)

export const deleteConversation = (id) => request(`/api/conversations/${id}`, { method: 'DELETE' })

// ---- Chat streaming ---------------------------------------------------------

/**
 * Read a Server-Sent Events stream and yield the text pieces it contains.
 *
 * The network delivers bytes in arbitrary chunks — one chunk may hold half an
 * event, or three events. So we keep a buffer, and only handle text up to the
 * last complete "\n\n" (the end-of-event marker).
 *
 * @param {ReadableStream<Uint8Array>} body  a fetch response body
 */
export async function* readSSE(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder() // bytes → text (handles emoji split across chunks)
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      // Split off every complete event; keep the incomplete rest in the buffer.
      const events = buffer.split('\n\n')
      buffer = events.pop()

      for (const event of events) {
        if (!event.startsWith('data: ')) continue
        const data = event.slice('data: '.length)
        if (data === '[DONE]') return

        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.text) yield parsed.text
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Send one new message and yield the reply as it streams in.
 * The server saves both and loads the earlier history itself.
 *
 *   for await (const text of streamChat(chatId, 'Hello', { signal })) { ... }
 *
 * @param {string} conversationId
 * @param {string} content  the new user message
 * @param {{ signal?: AbortSignal }} options  abort to stop (the Stop button)
 */
export async function* streamChat(conversationId, content, { signal } = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, content }),
    signal,
  })

  // Errors before streaming (e.g. 400 bad input) come back as normal JSON.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }

  yield* readSSE(res.body)
}
