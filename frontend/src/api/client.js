// Every call to the backend goes through this file.
// URLs start with /api — in development Vite forwards them to the Node server.

// One helper for all normal (non-streaming) JSON requests.
// Turns any error response into a thrown Error carrying the server's message.
async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
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

/** @param {string | null} documentId  link the new chat to this document (optional) */
export const createConversation = (documentId = null) =>
  request('/api/conversations', { method: 'POST', body: documentId ? { documentId } : {} })

/** @returns {Promise<{ conversation, messages: { id, role, content }[] }>} */
export const getConversation = (id) => request(`/api/conversations/${id}/messages`)

export const deleteConversation = (id) => request(`/api/conversations/${id}`, { method: 'DELETE' })

// ---- Documents --------------------------------------------------------------

/** @returns {Promise<{ id, filename, status, error, chunkCount, createdAt }[]>} newest first */
export const listDocuments = () => request('/api/documents')

export const getDocument = (id) => request(`/api/documents/${id}`)

/** @returns {Promise<{ questions: string[] }>} starter questions (may be empty) */
export const getSuggestedQuestions = (id, { signal } = {}) =>
  request(`/api/documents/${id}/suggestions`, { signal })

/**
 * Find passages in a document by meaning (no AI involved).
 * @returns {Promise<{ query, results: { pageNumber, chunkIndex, score, text }[] }>}
 */
export function searchDocument(id, query, { limit = 5, signal } = {}) {
  // URLSearchParams encodes special characters (&, ?, +, %, spaces) for us.
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return request(`/api/documents/${id}/search?${params}`, { signal })
}

/**
 * Upload a PDF. Resolves as soon as the server has saved it (status
 * 'processing'); poll getDocument() to find out when it's 'ready'.
 * @param {File} file
 */
export async function uploadDocument(file) {
  const form = new FormData()
  form.append('file', file) // the server reads the field named "file"

  // Don't set Content-Type yourself: the browser adds
  // "multipart/form-data; boundary=..." with the right boundary.
  const res = await fetch('/api/documents', { method: 'POST', body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Upload failed (${res.status})`)
  }
  return res.json()
}

// ---- Chat streaming ---------------------------------------------------------

/**
 * Read a Server-Sent Events stream and yield the events it contains:
 *   { type: 'text', text: 'Hel' }                 a piece of the reply
 *   { type: 'sources', sources: [{ pageNumber, score, excerpt }] }   pages used (document chats)
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
        if (parsed.text) yield { type: 'text', text: parsed.text }
        if (parsed.sources) yield { type: 'sources', sources: parsed.sources }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Send one new message and yield the reply's events as they stream in
 * (see readSSE). The server saves both and loads the earlier history itself.
 *
 *   for await (const event of streamChat(chatId, 'Hello', { signal })) { ... }
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
