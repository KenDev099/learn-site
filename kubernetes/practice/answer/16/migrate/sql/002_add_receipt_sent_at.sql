-- v2：expand。只加一個可以是 NULL 的欄位：v1 的程式不認得它也照常運作，回滾到 v1 不用動資料庫
-- 拿不到鎖就放棄，不要排在 ALTER TABLE 後面把整張表的查詢一起卡住（devops 課第 17 課）
SET lock_timeout = '5s';
ALTER TABLE orders ADD COLUMN receipt_sent_at timestamptz;
