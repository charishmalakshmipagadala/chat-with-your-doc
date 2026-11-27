// A tiny router: the part of Express that maps "GET /api/x/:id" to a function.
//
//   const router = createRouter()
//   router.add('GET', '/api/conversations/:id/messages', handler)
//   router.match('GET', '/api/conversations/42/messages')
//     → { handler, params: { id: '42' } }

export function createRouter() {
  const routes = []

  function add(method, pattern, handler) {
    // Turn the pattern into a regular expression:
    //   '/api/conversations/:id/messages'
    //   → /^\/api\/conversations\/(?<id>[^/]+)\/messages\/?$/
    const source = pattern
      .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // escape regex special characters
      .replace(/:(\w+)/g, '(?<$1>[^/]+)') // :id → named group matching one path segment

    routes.push({ method, regex: new RegExp(`^${source}/?$`), handler })
  }

  function match(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue
      const m = route.regex.exec(pathname)
      if (m) {
        // Turn %20 etc. back into normal characters.
        const params = {}
        for (const [key, value] of Object.entries(m.groups ?? {})) {
          params[key] = decodeURIComponent(value)
        }
        return { handler: route.handler, params }
      }
    }
    return null
  }

  /**
   * Which methods ARE registered for this path? Used to answer
   * "405 Method Not Allowed" (the path exists, but not with that method)
   * instead of a misleading "404 Not Found".
   */
  function allowedMethods(pathname) {
    const methods = new Set()
    for (const route of routes) {
      if (route.regex.test(pathname)) methods.add(route.method)
    }
    return [...methods]
  }

  return { add, match, allowedMethods }
}
