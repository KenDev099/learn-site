-- Up Migration
-- expand：只加一個可以是 NULL 的欄位。v1 不知道它存在，照常讀寫 phone
-- 這是只改中繼資料的 DDL，瞬間完成；但它要 ACCESS EXCLUSIVE 鎖，等不到就放棄，不要讓查詢排在它後面
ALTER TABLE customers ADD COLUMN mobile text;

-- Down Migration
ALTER TABLE customers DROP COLUMN mobile;
