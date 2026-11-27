CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY "orders_note_idx" ON "orders"("note");
