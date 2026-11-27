-- 第 26 課（期末專題）：在 coffee.sql 之上加庫存、訂單狀態、冪等鍵。這個檔不用改
ALTER TABLE products ADD COLUMN stock integer NOT NULL DEFAULT 100 CHECK (stock >= 0);   -- CHECK：程式寫錯時資料庫最後擋一次
ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'brewing', 'ready', 'picked_up', 'cancelled'));

-- Idempotency-Key：存在資料庫，所有程序看到的是同一份（第 24 課）
-- response_status 是 NULL 代表「處理中」；完成後存下狀態碼和回應，同一個 key 再來就原樣回傳
CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  fingerprint text NOT NULL,            -- 請求內容的指紋：同一個 key 配不同內容要回 422
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now()   -- 正式環境會定期刪掉太舊的 key
);
