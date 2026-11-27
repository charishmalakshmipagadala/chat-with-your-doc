import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRouter } from '../src/lib/router.js'

const noop = () => {}

test('matches a fixed path', () => {
  const router = createRouter()
  router.add('GET', '/api/health', noop)

  const result = router.match('GET', '/api/health')
  assert.equal(result.handler, noop)
  assert.deepEqual(result.params, {})
})

test('extracts :id params', () => {
  const router = createRouter()
  router.add('GET', '/api/conversations/:id/messages', noop)

  const result = router.match('GET', '/api/conversations/abc-123/messages')
  assert.deepEqual(result.params, { id: 'abc-123' })
})

test('decodes encoded params', () => {
  const router = createRouter()
  router.add('GET', '/api/files/:name', noop)

  assert.deepEqual(router.match('GET', '/api/files/my%20doc').params, { name: 'my doc' })
})

test('allows a trailing slash', () => {
  const router = createRouter()
  router.add('GET', '/api/health', noop)

  assert.ok(router.match('GET', '/api/health/'))
})

test('returns null when the method differs', () => {
  const router = createRouter()
  router.add('GET', '/api/health', noop)

  assert.equal(router.match('POST', '/api/health'), null)
})

test('does not match partial or extra segments', () => {
  const router = createRouter()
  router.add('GET', '/api/conversations/:id', noop)

  assert.equal(router.match('GET', '/api/conversations'), null)
  assert.equal(router.match('GET', '/api/conversations/1/extra'), null)
  assert.equal(router.match('GET', '/xx/api/conversations/1'), null)
})

test('allowedMethods lists the methods registered for a path', () => {
  const router = createRouter()
  router.add('GET', '/api/conversations/:id/messages', noop)
  router.add('DELETE', '/api/conversations/:id', noop)
  router.add('GET', '/api/conversations/:id', noop)

  assert.deepEqual(router.allowedMethods('/api/conversations/7').sort(), ['DELETE', 'GET'])
  assert.deepEqual(router.allowedMethods('/api/nothing-here'), [])
})

test('picks the right handler among several routes', () => {
  const router = createRouter()
  const list = () => {}
  const one = () => {}
  router.add('GET', '/api/conversations', list)
  router.add('GET', '/api/conversations/:id', one)

  assert.equal(router.match('GET', '/api/conversations').handler, list)
  assert.equal(router.match('GET', '/api/conversations/7').handler, one)
})
