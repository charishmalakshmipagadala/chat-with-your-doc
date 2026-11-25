-- Database tables for Chat with your Doc.
-- Run with: npm run migrate
-- Every statement uses IF NOT EXISTS, so running it again is safe.

-- pgvector: adds the `vector` column type and distance operators (<=>).
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per uploaded PDF.
CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    text NOT NULL,                 -- original name, e.g. "report.pdf"
  file_path   text NOT NULL,                 -- where it's saved on disk
  status      text NOT NULL DEFAULT 'processing'
              CHECK (status IN ('processing', 'ready', 'failed')),
  error       text,                          -- why processing failed (if it did)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Small pieces of a document's text, each with its embedding (384 numbers).
CREATE TABLE IF NOT EXISTS chunks (
  id           bigserial PRIMARY KEY,
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number  int  NOT NULL,
  chunk_index  int  NOT NULL,                -- order of the chunk within the document
  text         text NOT NULL,
  embedding    vector(384) NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks (document_id);

-- One row per chat in the sidebar.
CREATE TABLE IF NOT EXISTS conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL DEFAULT 'New chat',
  document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,  -- optional
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()  -- bumped on each new message
);

-- Every message in every chat.
-- `id` counts up (1, 2, 3, ...), so it also records the exact order messages
-- were saved. created_at alone isn't enough: rows saved in the same
-- transaction get the same now() timestamp.
CREATE TABLE IF NOT EXISTS messages (
  id               bigserial PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, id);
