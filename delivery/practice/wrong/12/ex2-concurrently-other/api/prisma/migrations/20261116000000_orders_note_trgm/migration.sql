CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CONCURRENTLY 只出現在一句不做事的句子（索引已經存在），搜尋要的 GIN 索引卻是一般的 CREATE INDEX（會擋住下單）
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_status_ordered_at_idx" ON "orders"("status", "ordered_at");
CREATE INDEX "orders_note_idx" ON "orders" USING GIN ("note" gin_trgm_ops);
