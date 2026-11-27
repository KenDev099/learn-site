-- Up Migration
-- 模擬一個要跑約 2 秒的步驟（正式環境可能是檢查資料、建立輔助表）。不要改這個檔
SELECT pg_sleep(2);
-- 加一個可以是 NULL 的欄位：只改中繼資料、瞬間完成，但要拿 orders 的 ACCESS EXCLUSIVE 鎖
ALTER TABLE orders ADD COLUMN note text;

-- Down Migration
ALTER TABLE orders DROP COLUMN note;
