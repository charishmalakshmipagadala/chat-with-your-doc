// A web server using only Node's built-in http module — no Express.
import http from 'node:http'
import { createRouter } from './lib/router.js'
import { sendJson, sendError, setCors } from './lib/http.js'
import { config } from './config.js' // checks required settings at startup
import { chatHandler } from './routes/chat.js'
import {
  createConversation,
  listConversations,
  getConversationMessages,
  deleteConversation,
} from './routes/conversations.js'
import { pool, initDb } from './db/pool.js'

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

// ---- The server -----------------------------------------------------------
// This ONE function receives every request.
const server = http.createServer(async (req, res) => {
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

  // 3. Find the route, or 404
  const route = router.match(req.method, url.pathname)
  if (!route) {
    sendError(res, 404, `No route for ${req.method} ${url.pathname}`)
    return
  }

  // 4. Run the handler. Any error thrown inside lands here — this is our
  //    single error handler.
  try {
    await route.handler(req, res, route.params, url)
  } catch (err) {
    const status = err.status ?? 500
    if (status === 500) console.error(err) // only log unexpected errors
    if (res.headersSent) {
      res.end() // already started replying (e.g. streaming) — just close
    } else {
      sendError(res, status, status === 500 ? 'Internal server error' : err.message)
    }
  }
})

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
})
