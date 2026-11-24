// Server-Sent Events (SSE): keep one HTTP response open and push small
// messages down it as they become ready. Each message looks like:
//
//   data: {"text":"Hello"}\n\n
//
// The blank line (\n\n) marks the end of one message.

export function startSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', // tells the browser this is a stream
    'Cache-Control': 'no-cache', // never cache a live stream
    Connection: 'keep-alive', // keep the connection open
  })
  res.flushHeaders() // send headers now, before the first message
}

export function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function endSSE(res) {
  res.write('data: [DONE]\n\n')
  res.end()
}
