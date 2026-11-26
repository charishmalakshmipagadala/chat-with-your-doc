import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, chunkPages } from '../src/services/parser.js'

// "Sentence 1. Sentence 2. ..." — easy to see where chunks cut.
const sentences = (n) =>
  Array.from({ length: n }, (_, i) => `This is sentence number ${i + 1}.`).join(' ')

test('empty or whitespace-only text gives no chunks', () => {
  assert.deepEqual(chunkText(''), [])
  assert.deepEqual(chunkText('  \n\t  '), [])
})

test('short text stays one chunk, with whitespace cleaned up', () => {
  assert.deepEqual(chunkText('Hello\n\n   world.  '), ['Hello world.'])
})

test('long text: every chunk is at most `size` characters', () => {
  const chunks = chunkText(sentences(200), { size: 800, overlap: 150 })
  assert.ok(chunks.length > 1)
  for (const c of chunks) assert.ok(c.length <= 800, `chunk too long: ${c.length}`)
})

test('chunks end at a sentence boundary when possible', () => {
  const chunks = chunkText(sentences(200), { size: 800, overlap: 150 })
  for (const c of chunks.slice(0, -1)) assert.ok(c.endsWith('.'), `cut mid-sentence: "…${c.slice(-30)}"`)
})

test('neighbouring chunks overlap', () => {
  const chunks = chunkText(sentences(200), { size: 800, overlap: 150 })
  for (let i = 1; i < chunks.length; i++) {
    const tailOfPrevious = chunks[i - 1].slice(-100)
    assert.ok(chunks[i].includes(tailOfPrevious.slice(-50)), `chunk ${i} doesn't overlap chunk ${i - 1}`)
  }
})

test('no text is lost: every sentence appears in some chunk', () => {
  const chunks = chunkText(sentences(200), { size: 800, overlap: 150 })
  const all = chunks.join(' ')
  for (let i = 1; i <= 200; i++) assert.ok(all.includes(`sentence number ${i}.`), `lost sentence ${i}`)
})

test('a single huge word is still cut (no infinite loop)', () => {
  const chunks = chunkText('x'.repeat(2000), { size: 800, overlap: 150 })
  assert.ok(chunks.length >= 3)
  for (const c of chunks) assert.ok(c.length <= 800)
})

test('chunkPages keeps page numbers and numbers chunks in order', () => {
  const chunks = chunkPages([
    { pageNumber: 1, text: 'Cats sleep a lot.' },
    { pageNumber: 2, text: '   ' }, // empty page (e.g. a picture) → no chunks
    { pageNumber: 3, text: sentences(60) },
  ])
  assert.equal(chunks[0].pageNumber, 1)
  assert.equal(chunks[0].text, 'Cats sleep a lot.')
  assert.ok(chunks.slice(1).every((c) => c.pageNumber === 3))
  assert.deepEqual(
    chunks.map((c) => c.chunkIndex),
    chunks.map((_, i) => i),
  )
})
