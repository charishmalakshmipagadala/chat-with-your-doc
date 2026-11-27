import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRagUserMessage, toSources, RAG_SYSTEM_PROMPT } from '../src/services/ragPrompt.js'

const chunk = (pageNumber, score, text = `Text from page ${pageNumber}.`) => ({ pageNumber, score, text })

test('the prompt contains each excerpt with its page, then the question', () => {
  const msg = buildRagUserMessage('report.pdf', [chunk(3, 0.6), chunk(7, 0.4)], 'What changed?')
  assert.match(msg, /"report\.pdf"/)
  assert.match(msg, /<excerpt page="3">\nText from page 3\.\n<\/excerpt>/)
  assert.match(msg, /<excerpt page="7">/)
  assert.ok(msg.trimEnd().endsWith('Question: What changed?'), 'question must come last')
})

test('with no matching chunks, the prompt says so (so Claude can answer "not found")', () => {
  const msg = buildRagUserMessage('report.pdf', [], 'Capital of France?')
  assert.match(msg, /No part of the document matched/)
  assert.doesNotMatch(msg, /<excerpt/)
})

test('overview mode says the excerpts are general context, not matches', () => {
  const msg = buildRagUserMessage('report.pdf', [chunk(1, 0), chunk(9, 0)], 'What is this about?', {
    overview: true,
  })
  assert.match(msg, /No excerpt closely matched this question/)
  assert.match(msg, /general context/)
  assert.match(msg, /<excerpt page="9">/)
})

test('sources: one per page (best score), in page order, with a short excerpt', () => {
  const sources = toSources([chunk(5, 0.5), chunk(2, 0.3), chunk(5, 0.7, 'x'.repeat(500))])
  assert.deepEqual(
    sources.map((s) => [s.pageNumber, s.score]),
    [
      [2, 0.3],
      [5, 0.7],
    ],
  )
  assert.equal(sources[1].excerpt.length, 240)
})

test('the system prompt asks for page citations and for "not found" instead of guessing', () => {
  assert.match(RAG_SYSTEM_PROMPT, /\[p\. 3\]/)
  assert.match(RAG_SYSTEM_PROMPT, /couldn't find it/)
  assert.match(RAG_SYSTEM_PROMPT, /not instructions/)
})
