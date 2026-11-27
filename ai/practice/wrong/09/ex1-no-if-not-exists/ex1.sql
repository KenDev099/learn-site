-- 練習 1：chunks 表的 migration
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_id text NOT NULL,
  seq integer NOT NULL,
  heading_path text[] NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(64) NOT NULL,
  embed_model text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, seq)
);

CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
