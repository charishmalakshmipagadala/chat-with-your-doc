// A web server using only Node's built-in http module — no Express.
import http from 'node:http'
import { createRouter } from './lib/router.js'
import { randomUUID } from 'node:crypto'
import { sendJson, sendError, setCors, HttpError } from './lib/http.js'
import { config } from './config.js' // checks required settings at startup
import { chatHandler } from './routes/chat.js'
import {
  createConversation,
  listConversations,
  getConversationMessages,
  deleteConversation,
} from './routes/conversations.js'
import {
  uploadDocument,
  listDocuments,
  getDocument,
  searchDocument,
  getDocumentSuggestions,
} from './routes/documents.js'
import { pool, initDb } from './db/pool.js'
import { warmUpEmbeddings } from './services/embeddings.js'
import { resumePendingIngests } from './services/ingest.js'

const PORT = config.port

// ---- Routes ---------------------------------------------------------------
// Every handler has the same shape: (req, res, params, url) => { ... }
const router = createRouter()

// Health check: is the server up, and can it reach the database?
router.add('GET', '/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    sendJson(res, 200, { ok: true, db: 'up' })
  } catch {
    sendJson(res, 503, { ok: false, db: 'down' })
  }
})

router.add('POST', '/api/chat', chatHandler)

router.add('POST', '/api/conversations', createConversation)
router.add('GET', '/api/conversations', listConversations)
router.add('GET', '/api/conversations/:id/messages', getConversationMessages)
router.add('DELETE', '/api/conversations/:id', deleteConversation)

router.add('POST', '/api/documents', uploadDocument)
router.add('GET', '/api/documents', listDocuments)
router.add('GET', '/api/documents/:id', getDocument)
router.add('GET', '/api/documents/:id/search', searchDocument)
router.add('GET', '/api/documents/:id/suggestions', getDocumentSuggestions)

// ---- Request logging ------------------------------------------------------
// One line per request, written when it ends:
//   GET /api/documents 200 12ms [a1b2c3d4]
// The [id] is also sent to the browser (X-Request-Id header, and inside 500
// errors), so a user's error report can be matched to the server log.
function logRequest(req, res, requestId, started) {
  res.on('close', () => {
    const ms = Date.now() - started
    // 'close' fires even when the browser leaves early (e.g. Stop); then the
    // response never finished normally.
    const outcome = res.writableFinished ? res.statusCode : `${res.statusCode} (client left)`
    // The document status polling runs every 2 s; skip successful ones to keep the log readable.
    const isPoll = req.method === 'GET' && /^\/api\/documents\/[^/]+$/.test(req.url)
    if (isPoll && res.statusCode === 200) return
    console.log(`${req.method} ${req.url} ${outcome} ${ms}ms [${requestId}]`)
  })
}

// ---- The server -----------------------------------------------------------
// This ONE function receives every request.
const server = http.createServer(async (req, res) => {
  const requestId = randomUUID().slice(0, 8) // short id is enough to find a log line
  res.setHeader('X-Request-Id', requestId)
  logRequest(req, res, requestId, Date.now())

  // 1. CORS headers on every response
  setCors(res)
  if (req.method === 'OPTIONS') {
    // Browser "preflight" check before a cross-origin POST: just say OK.
    res.writeHead(204)
    res.end()
    return
  }

  // 2. Parse the URL: '/api/x?q=hi' → pathname '/api/x', searchParams { q: 'hi' }
  const url = new URL(req.url, 'http://localhost')

  // 3. Find the route. No match: 405 if the path exists with other methods,
  //    otherwise 404.
  const route = router.match(req.method, url.pathname)
  if (!route) {
    const allowed = router.allowedMethods(url.pathname)
    if (allowed.length > 0) {
      res.setHeader('Allow', [...allowed, 'OPTIONS'].join(', '))
      sendError(res, 405, `${req.method} is not allowed here. Use: ${allowed.join(', ')}`)
    } else {
      sendError(res, 404, `No route for ${req.method} ${url.pathname}`)
    }
    return
  }

  // 4. Run the handler. Any error thrown inside lands here — this is our
  //    single error handler.
  try {
    await route.handler(req, res, route.params, url)
  } catch (err) {
    // Only OUR HttpErrors are meant for the user. Anything else — a bug, a
    // database error, an error from the Claude SDK (which also has a .status!)
    // — may contain internal details, so the user just gets a generic 500.
    const expected = err instanceof HttpError
    const status = expected ? err.status : 500
    if (!expected) console.error(`[${requestId}] Unexpected error:`, err)

    if (res.headersSent) {
      res.end() // already started replying (e.g. streaming) — just close
    } else {
      sendError(
        res,
        status,
        expected ? err.message : `Internal server error (reference: ${requestId})`,
      )
    }
  }
})

// ---- Errors outside any request ---------------------------------------------
// A promise that fails with nobody handling it (e.g. a background job bug).
// Log it loudly instead of letting it pass silently.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
// A thrown error nothing caught: the process may be in a broken state, so log
// it and exit. (`npm run dev` restarts on the next file change.)
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — shutting down:', err)
  process.exit(1)
})

// ---- Clean shutdown (Ctrl+C) -------------------------------------------------
// Stop accepting requests, close database connections, then exit. This frees
// port 3001 straight away (no more "EADDRINUSE: address already in use").
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} received — shutting down…`)
  server.close() // stop accepting new connections
  server.closeAllConnections() // end open ones too (e.g. a streaming reply)
  pool.end().finally(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref() // never hang longer than 3 s
}
process.on('SIGINT', () => shutdown('SIGINT')) // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')) // e.g. `kill`, Docker stop

// Make sure the database is reachable before we accept any requests.
try {
  await initDb()
} catch (err) {
  console.error(`\n❌ Can't use the database: ${err.message}`)
  console.error('   Is it running? Try: docker compose up -d   (then: npm run migrate)\n')
  process.exit(1)
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(
    config.fakeLlm
      ? '🧪 FAKE_LLM=true: replies are fake (no Claude calls, no cost)'
      : `🤖 Using Claude model ${config.model}`,
  )
  warmUpEmbeddings() // load the embedding model in the background
  resumePendingIngests().catch((err) => console.error('Could not resume processing:', err.message))
})
