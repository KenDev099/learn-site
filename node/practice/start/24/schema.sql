-- 第 24 課：在 coffee.sql 之上加訂單狀態（練習 3）與冪等鍵（練習 2）
ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'received'
  CHECK (status IN ('received', 'brewing', 'ready', 'picked_up'));

-- 練習 2 TODO：建立 idempotency_keys 表
--   key             text，主鍵（PRIMARY KEY 本身就是唯一索引，「誰先到」靠它判斷）
--   fingerprint     text，不可為 NULL：請求內容的指紋，同一個 key 換了內容要擋下
--   response_status integer：第一次回應的狀態碼
--   response_body   jsonb：第一次回應的 body
--   created_at      timestamptz，不可為 NULL，預設 now()：之後可以定期刪掉太舊的 key
