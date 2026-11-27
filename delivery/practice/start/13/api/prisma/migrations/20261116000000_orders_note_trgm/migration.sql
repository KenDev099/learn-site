-- 店員訂單搜尋（note ILIKE '%關鍵字%'）用的索引。一般的 B-tree 索引幫不了前後都有 % 的 ILIKE，要用 pg_trgm 的 GIN 索引
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CONCURRENTLY：建索引時不擋 orders 的寫入（下單）。不能放在交易裡；Prisma 7.10.1 的 migrate deploy 不會把檔案包進交易
CREATE INDEX CONCURRENTLY "orders_note_idx" ON "orders" USING GIN ("note" gin_trgm_ops);
