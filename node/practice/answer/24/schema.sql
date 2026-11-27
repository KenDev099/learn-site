-- 第 24 課：在 coffee.sql 之上加訂單狀態（練習 3）與冪等鍵（練習 2）
ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'received'
  CHECK (status IN ('received', 'brewing', 'ready', 'picked_up'));

-- 練習 2：冪等鍵。所有程序共用這張表，程序重啟也還在
CREATE TABLE idempotency_keys (
  key             text PRIMARY KEY,
  fingerprint     text NOT NULL,
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
