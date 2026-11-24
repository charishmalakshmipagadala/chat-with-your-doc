// Every call to the backend goes through this file.
// URLs start with /api — in development Vite forwards them to the Node server.

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
 * Send the conversation to the server and yield the reply as it streams in.
 *
 *   for await (const text of streamChat(messages, { signal })) { ... }
 *
 * @param {{ role: string, content: string }[]} messages
 * @param {{ signal?: AbortSignal }} options  abort to stop (the Stop button)
 */
export async function* streamChat(messages, { signal } = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  // Errors before streaming (e.g. 400 bad input) come back as normal JSON.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }

  yield* readSSE(res.body)
}
