import { useEffect, useState } from 'react'
import { getSuggestedQuestions } from '../api/client.js'

/**
 * Clickable starter questions for a document, shown on an empty chat.
 * If they can't be loaded, nothing is shown — they're a nice extra, not essential.
 */
function SuggestedQuestions({ documentId, onAsk, disabled }) {
  // Which document the loaded questions belong to, so a slow answer for a
  // previous document is never shown under the current one.
  const [loaded, setLoaded] = useState({ documentId: null, questions: [] })

  useEffect(() => {
    const controller = new AbortController()
    getSuggestedQuestions(documentId, { signal: controller.signal })
      .then((data) => setLoaded({ documentId, questions: data.questions }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ documentId, questions: [] })
      })
    return () => controller.abort() // switched document (or left) before it answered
  }, [documentId])

  const isLoading = loaded.documentId !== documentId

  if (isLoading) {
    return (
      <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Loading suggestions">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-9 w-48 animate-pulse rounded-xl bg-gray-800" />
        ))}
      </div>
    )
  }

  if (loaded.questions.length === 0) return null

  return (
    <div className="mt-6 w-full max-w-2xl">
      <p className="mb-2 text-center text-xs uppercase tracking-wide text-gray-400">Try asking</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {loaded.questions.map((q) => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-2 text-left text-sm text-gray-200 hover:border-indigo-500 hover:bg-gray-800 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

export default SuggestedQuestions
