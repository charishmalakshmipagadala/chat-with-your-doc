// PDF → text per page → small overlapping chunks (each remembers its page).
import { extractText, getDocumentProxy } from 'unpdf'

export const CHUNK_SIZE = 800 // characters per chunk (roughly 150–200 words)
export const CHUNK_OVERLAP = 150 // characters repeated between neighbouring chunks

/**
 * Read the text of every page.
 * @param {Uint8Array} data  the PDF file's bytes
 * @returns {Promise<{ pageNumber: number, text: string }[]>}  pageNumber starts at 1
 */
export async function extractPages(data) {
  const pdf = await getDocumentProxy(new Uint8Array(data))
  try {
    const { text } = await extractText(pdf, { mergePages: false }) // one string per page
    return text.map((pageText, i) => ({ pageNumber: i + 1, text: pageText }))
  } finally {
    await pdf.cleanup() // free the memory PDF.js used for this file
  }
}

/**
 * Split one page's text into chunks of about `size` characters, where each
 * chunk repeats the last `overlap` characters of the previous one.
 *
 * Chunks try to end at a sentence end (". "), or at least a space, so words and
 * sentences aren't cut in half.
 *
 * @returns {string[]}
 */
export function chunkText(text, { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  const clean = text
    .replaceAll('\u0000', '') // NUL can't be stored in Postgres text (some PDFs contain it)
    .replace(/\s+/g, ' ') // PDFs are full of stray line breaks
    .trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]

  const chunks = []
  const minLength = Math.floor(size * 0.6) // don't end a chunk earlier than this
  let start = 0

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)

    if (end < clean.length) {
      const window = clean.slice(start, end)
      const sentenceEnd = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
      )
      const space = window.lastIndexOf(' ')
      if (sentenceEnd >= minLength) end = start + sentenceEnd + 1 // keep the "."
      else if (space >= minLength) end = start + space
      // else: one very long "word" (e.g. a URL) — cut it at `size`
    }

    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break

    // Start the next chunk `overlap` characters back, at the start of a word.
    let next = end - overlap
    const space = clean.indexOf(' ', next)
    if (space !== -1 && space < end) next = space + 1
    start = Math.max(next, start + 1) // always move forward
  }

  return chunks
}

/**
 * Chunk every page. Chunks never cross a page boundary, so each chunk has
 * exactly one page number to cite.
 *
 * @param {{ pageNumber: number, text: string }[]} pages
 * @returns {{ pageNumber: number, chunkIndex: number, text: string }[]}
 */
export function chunkPages(pages, options) {
  const chunks = []
  for (const page of pages) {
    for (const text of chunkText(page.text, options)) {
      chunks.push({ pageNumber: page.pageNumber, chunkIndex: chunks.length, text })
    }
  }
  return chunks
}
