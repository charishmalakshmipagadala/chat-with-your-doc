// Integration test: the REAL pipeline, end to end.
//   PDF → ingestDocument (parse, chunk, embed, save in Postgres) → findRelevantChunks
// and check that each question finds the page that really answers it.
//
// Needs the database (docker compose up -d) and the embedding model (downloaded
// once). Without DATABASE_URL — e.g. no .env — the tests are skipped, not failed.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makePdf } from './helpers/makePdf.js'

// One topic per page, so the right answer is unambiguous.
const PAGES = [
  'Domestic cats sleep between twelve and sixteen hours a day. They are most active at dawn and dusk, which is when their wild ancestors hunted. Kittens sleep even more than adult cats.',
  'Blue whales are the largest animals ever known. They feed almost entirely on krill, tiny shrimp-like creatures, and can eat up to four tonnes of krill in a single day during the feeding season.',
  'In the third quarter the company reported revenue of 48 million dollars, an increase of 12 percent compared with the same quarter last year. Operating costs stayed flat, so profit margins improved.',
  'Python is a popular programming language known for its readable syntax. It is widely used for data analysis, machine learning, web development and automation scripts.',
]

const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set (start the database and use npm test)'
process.env.FAKE_LLM ??= 'true' // these tests never call Claude, so no API key is needed

let db, retrieval, ingest, tempDir
const documentId = randomUUID()

before(async () => {
  if (skip) return
  // Imported here (not at the top) so a missing DATABASE_URL skips the tests
  // instead of config.js stopping the whole test run.
  db = await import('../src/db/pool.js')
  retrieval = await import('../src/services/retrieval.js')
  ingest = await import('../src/services/ingest.js')
  await db.initDb()

  tempDir = await mkdtemp(path.join(tmpdir(), 'docchat-test-'))
  const filePath = path.join(tempDir, 'topics.pdf')
  await writeFile(filePath, makePdf(PAGES))
  await db.pool.query(`INSERT INTO documents (id, filename, file_path) VALUES ($1, $2, $3)`, [
    documentId,
    'topics.pdf',
    filePath,
  ])
  await ingest.ingestDocument(documentId) // the real background job, run directly
})

after(async () => {
  if (skip) return
  await db.pool.query(`DELETE FROM documents WHERE id = $1`, [documentId]) // cascades to chunks
  await rm(tempDir, { recursive: true, force: true })
  await db.pool.end()
})

test('ingest: the document becomes ready, with one chunk per page', { skip }, async () => {
  const { rows } = await db.pool.query(
    `SELECT status, error, (SELECT count(*)::int FROM chunks WHERE document_id = $1) AS chunks
       FROM documents WHERE id = $1`,
    [documentId],
  )
  assert.equal(rows[0].error, null)
  assert.equal(rows[0].status, 'ready')
  assert.equal(rows[0].chunks, PAGES.length)
})

// Questions that share few or no words with the answer — only "meaning" links them.
const CASES = [
  { question: 'How much do whales eat?', page: 2 },
  { question: 'Did the business make more money?', page: 3 },
  { question: 'When are cats awake?', page: 1 },
  { question: 'Which language is good for AI?', page: 4 },
]

for (const { question, page } of CASES) {
  test(`retrieval: "${question}" → page ${page}`, { skip }, async () => {
    const results = await retrieval.findRelevantChunks(documentId, question)
    assert.equal(results[0].pageNumber, page, `top match was page ${results[0].pageNumber}`)
    assert.ok(results[0].score >= retrieval.MIN_SCORE, `score ${results[0].score} below the cutoff`)
  })
}

test('retrieval: results are sorted best first', { skip }, async () => {
  const results = await retrieval.findRelevantChunks(documentId, 'whales and krill')
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, 'scores must not increase')
  }
})

test('retrieval: an unrelated question finds nothing above the cutoff', { skip }, async () => {
  const results = await retrieval.findRelevantChunks(documentId, 'What is the capital of France?', {
    minScore: retrieval.MIN_SCORE,
  })
  assert.deepEqual(results, [])
})

test('retrieval: only searches the given document', { skip }, async () => {
  const results = await retrieval.findRelevantChunks(randomUUID(), 'How much do whales eat?')
  assert.deepEqual(results, [])
})

test('sampleDocumentChunks: a spread from the whole document, in order', { skip }, async () => {
  const sample = await retrieval.sampleDocumentChunks(documentId)
  assert.deepEqual(
    sample.map((c) => c.pageNumber),
    [1, 2, 3, 4],
  )
})
