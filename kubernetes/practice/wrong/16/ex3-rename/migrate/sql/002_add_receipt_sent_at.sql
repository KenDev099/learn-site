-- v2：把 total 改名成 total_amount，順便加收據時間
SET lock_timeout = '5s';
ALTER TABLE orders RENAME COLUMN total TO total_amount;
ALTER TABLE orders ADD COLUMN receipt_sent_at timestamptz;
