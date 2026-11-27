import { useEffect, useState } from 'react'
import { searchDocument } from '../api/client.js'

const DEBOUNCE_MS = 300 // wait this long after the last key press before searching
const RESULT_LIMIT = 8

// Wrap the search words that appear in `text` in <mark>, so they stand out.
// (Search is by meaning, so a result may match without sharing any words.)
function Highlight({ text, query }) {
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3) // skip "a", "of", "is"...
  if (words.length === 0) return text

  // Escape regex special characters, then match any of the words.
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')

  // split() with a capturing group keeps the matches: odd indexes are matches.
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-500/30 px-0.5 text-yellow-100">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/**
 * Search tab: type a question, see the matching passages and their pages.
 * Runs only the local embedding model + database — free and instant.
 */
function SearchPanel({ document, onAsk, askDisabled }) {
  const [query, setQuery] = useState('')
  // The latest finished search, and which query it was for.
  const [search, setSearch] = useState({ query: '', results: [], error: null })

  const trimmed = query.trim()

  // What to show is DERIVED from the two values above — no extra state:
  //   empty box                       → nothing
  //   results are for an older query  → "Searching…" (typing, or request in flight)
  //   otherwise                       → the results, or the error
  const status = !trimmed
    ? 'idle'
    : search.query !== trimmed
      ? 'loading'
      : search.error
        ? 'error'
        : 'done'
  const { results, error } = search

  // Search when the query stops changing for DEBOUNCE_MS ("debouncing").
  useEffect(() => {
    if (!trimmed) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await searchDocument(document.id, trimmed, {
          limit: RESULT_LIMIT,
          signal: controller.signal,
        })
        setSearch({ query: trimmed, results: data.results, error: null })
      } catch (err) {
        if (controller.signal.aborted) return // replaced by a newer search
        setSearch({ query: trimmed, results: [], error: err.message })
      }
    }, DEBOUNCE_MS)

    // Runs when the query changes again (or the panel closes): cancel the
    // pending timer AND any request already sent, so an old, slow answer can
    // never overwrite the results of a newer search.
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, document.id])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${document.filename} by meaning…`}
          autoFocus
          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
        />
        <p className="mt-2 text-xs text-gray-400">
          Finds passages with a similar meaning, even if they use different words. No AI is
          called, so it's free and instant.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
          {status === 'loading' && <p className="text-sm text-gray-400">Searching…</p>}
          {status === 'error' && <p className="text-sm text-red-400">⚠️ {error}</p>}

          {status === 'done' && results.length === 0 && (
            <p className="text-sm text-gray-400">
              Nothing in this document matches “{trimmed}”. Try different words.
            </p>
          )}

          {status === 'done' && results.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-400">
                  {results.length} passage{results.length === 1 ? '' : 's'}, best match first
                </p>
                <button
                  onClick={() => onAsk(trimmed)}
                  disabled={askDisabled}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  💬 Ask this in chat
                </button>
              </div>

              {results.map((r) => (
                <article
                  key={r.chunkIndex}
                  className="rounded-xl border border-gray-800 bg-gray-950/60 p-4"
                >
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-indigo-800 bg-indigo-950/60 px-2 py-0.5 text-indigo-300">
                      📄 p. {r.pageNumber}
                    </span>
                    <span className="text-gray-400">match {Math.round(r.score * 100)}%</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-200">
                    <Highlight text={r.text} query={trimmed} />
                  </p>
                </article>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchPanel
