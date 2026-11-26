// Text → embedding: a list of 384 numbers that captures what the text MEANS.
// Texts with similar meaning get similar numbers, even if they use different
// words ("whale food" ≈ "krill"). This is what makes document search work.
//
// The model runs locally with Transformers.js: free, no API key, works offline
// after the first download (~90 MB, cached in backend/.cache/models).
import { pipeline, env } from '@huggingface/transformers'
import { config } from '../config.js'

const MODEL = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIMENSIONS = 384 // must match vector(384) in schema.sql
const BATCH_SIZE = 32 // texts per model call (bigger = faster, but more memory)

env.cacheDir = config.modelCacheDir

// Loading the model takes a few seconds, so we do it once and reuse it.
// We store the *promise*, so if two requests arrive while it's still loading,
// both wait for the same load instead of loading it twice.
let extractorPromise = null

function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', MODEL, { dtype: 'fp32' }).catch((err) => {
    extractorPromise = null // allow a retry next time (e.g. the download failed)
    throw err
  })
  return extractorPromise
}

/** Start loading the model in the background, so the first upload is faster. */
export function warmUpEmbeddings() {
  getExtractor().catch((err) => console.error('Could not load embedding model:', err.message))
}

/**
 * Embed many texts.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}  one 384-number array per text, same order
 */
export async function embedTexts(texts) {
  const extractor = await getExtractor()
  const vectors = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    // pooling 'mean': average the per-word vectors into one vector per text.
    // normalize: scale each vector to length 1, so comparing two of them is a
    // simple dot product (= cosine similarity).
    const output = await extractor(batch, { pooling: 'mean', normalize: true })
    vectors.push(...output.tolist())
  }

  return vectors
}

/** Embed one text (e.g. a user's question). */
export async function embedText(text) {
  const [vector] = await embedTexts([text])
  return vector
}
