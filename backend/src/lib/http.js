// Small helpers that Express would normally give you.

const MAX_JSON_BYTES = 1024 * 1024 // 1 MB

// An error that carries an HTTP status code. Handlers can `throw new HttpError(400, '...')`
// and server.js turns it into a JSON response with that status.
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Read the request body and parse it as JSON.
// The body arrives in pieces ("chunks"), so we collect them first.
export async function readJson(req) {
  const chunks = []
  let size = 0

  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk)
  }

  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// IDs in URLs come from the user. If one isn't a valid UUID, no row can have
// it — answer 404 right away instead of letting Postgres throw a type error (500).
export function assertUuid(id, what = 'Item') {
  if (!UUID_RE.test(id)) throw new HttpError(404, `${what} not found`)
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message })
}

// CORS: lets a web page on another origin (e.g. localhost:5173) call this API.
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
