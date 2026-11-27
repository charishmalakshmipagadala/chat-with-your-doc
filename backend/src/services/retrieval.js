// Retrieval: given a question, find the chunks of a document that are most
// likely to contain the answer — the "R" in RAG (Retrieval-Augmented
// Generation). The prompt that hands them to Claude is built in ragPrompt.js.
import pgvector from 'pgvector'
import { pool } from '../db/pool.js'
import { embedText } from './embeddings.js'

export const DEFAULT_TOP_K = 5 // how many chunks to give Claude
// Chunks scoring below this are treated as "not related". Measured on our test
// PDF: real matches scored 0.39–0.64, unrelated chunks 0.13 or less.
export const MIN_SCORE = 0.25

/**
 * @param {string} documentId
 * @param {string} question
 * @param {{ topK?: number, minScore?: number }} options
 * @returns {Promise<{ id: string, pageNumber: number, chunkIndex: number, text: string, score: number }[]>}
 *   best match first. score: 1 = same meaning, ~0 = unrelated.
 */
export async function findRelevantChunks(
  documentId,
  question,
  { topK = DEFAULT_TOP_K, minScore = -1 } = {},
) {
  // 1. Turn the question into a vector, the same way the chunks were turned
  //    into vectors. Now they can be compared.
  const questionVector = await embedText(question)

  // 2. Let Postgres rank this document's chunks by closeness.
  //    `<=>` is pgvector's cosine DISTANCE: 0 = identical meaning, 2 = opposite.
  //    So smaller is better, and 1 - distance gives a similarity score.
  const { rows } = await pool.query(
    `SELECT id, page_number AS "pageNumber", chunk_index AS "chunkIndex", text,
            1 - (embedding <=> $2::vector) AS score
       FROM chunks
      WHERE document_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [documentId, pgvector.toSql(questionVector), topK],
  )
  return rows.filter((r) => r.score >= minScore)
}
