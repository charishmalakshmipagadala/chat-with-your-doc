// Read a file upload (multipart/form-data) without a library like multer.
//
// Node's `req` is a Node stream, but Node also ships the browser's web APIs:
// `Request` and its `.formData()` method, which already knows how to parse
// multipart bodies. So we wrap `req` in a web Request and let it do the work.
import { Readable } from 'node:stream'
import { HttpError } from './http.js'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 20 MB

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<FormData>}
 */
export async function readFormData(req) {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    throw new HttpError(400, 'Send the file as multipart/form-data')
  }

  // 1. Cheap check first: the size the client says it's sending.
  const declared = Number(req.headers['content-length'])
  if (declared > MAX_UPLOAD_BYTES) throw tooLarge()

  // 2. The header can be missing or wrong, so also count the real bytes as
  //    they stream in, and stop as soon as we pass the limit.
  let received = 0
  let overLimit = false
  const limiter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (received > MAX_UPLOAD_BYTES) {
        overLimit = true
        controller.error(tooLarge())
      } else {
        controller.enqueue(chunk)
      }
    },
  })

  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': contentType }, // includes the multipart "boundary"
    body: Readable.toWeb(req).pipeThrough(limiter),
    duplex: 'half', // required by Node when the body is a stream
  })

  try {
    return await request.formData()
  } catch {
    if (overLimit) throw tooLarge()
    throw new HttpError(400, 'Could not read the uploaded form data')
  }
}

function tooLarge() {
  return new HttpError(413, `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`)
}
