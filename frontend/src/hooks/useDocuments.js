import { useEffect, useState } from 'react'
import * as api from '../api/client.js'

const POLL_INTERVAL_MS = 2000
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // same limit as the server

/**
 * Uploaded documents: the list, uploading, and watching their status.
 *
 * A document goes: uploading (browser only) → processing → ready | failed.
 * While any document is 'processing', we ask the server for its status every
 * 2 seconds ("polling") until it changes.
 */
export function useDocuments() {
  const [documents, setDocuments] = useState([])
  const [error, setError] = useState(null)

  // Load the list once, when the app first appears.
  useEffect(() => {
    api
      .listDocuments()
      .then(setDocuments)
      .catch((err) => setError(`Couldn't load your documents: ${err.message}`))
  }, [])

  // ---- polling -------------------------------------------------------------
  // A string like "id1,id2" of the documents still processing. Using a string
  // (not an array) means the effect below only restarts when that set really
  // changes — not on every render.
  const processingIds = documents
    .filter((d) => d.status === 'processing')
    .map((d) => d.id)
    .join(',')

  useEffect(() => {
    if (!processingIds) return // nothing to watch

    const timer = setInterval(async () => {
      for (const id of processingIds.split(',')) {
        try {
          const doc = await api.getDocument(id)
          if (doc.status !== 'processing') {
            setDocuments((prev) => prev.map((d) => (d.id === id ? doc : d)))
          }
        } catch {
          // A network hiccup: just try again on the next tick.
        }
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer) // stop when the set changes or the app closes
  }, [processingIds])

  // ---- uploading -----------------------------------------------------------

  async function upload(file) {
    setError(null)

    // Check in the browser first, for instant feedback. (The server checks
    // again — never trust only the browser.)
    if (file.type !== 'application/pdf') {
      setError(`"${file.name}" is not a PDF. Only PDF files are supported.`)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`"${file.name}" is too large (max 20 MB).`)
      return
    }

    // Show a card right away, while the file is still being sent.
    const tempId = `upload-${crypto.randomUUID()}`
    setDocuments((prev) => [{ id: tempId, filename: file.name, status: 'uploading' }, ...prev])

    try {
      const doc = await api.uploadDocument(file)
      // Swap the temporary card for the real document (status 'processing').
      setDocuments((prev) => prev.map((d) => (d.id === tempId ? { chunkCount: 0, ...doc } : d)))
    } catch (err) {
      setDocuments((prev) => prev.filter((d) => d.id !== tempId))
      setError(`Couldn't upload "${file.name}": ${err.message}`)
    }
  }

  return { documents, upload, error }
}
