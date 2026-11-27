-- Up Migration
CREATE INDEX orders_ordered_at_idx ON orders (ordered_at);
-- 模擬一個要跑一陣子的 migration：正式環境建索引、回填資料常常要好幾秒到好幾分鐘
SELECT pg_sleep(2);

-- Down Migration
DROP INDEX orders_ordered_at_idx;
