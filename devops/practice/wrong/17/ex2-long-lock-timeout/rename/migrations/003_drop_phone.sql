-- Up Migration
-- contract：v1、v2 都下線、只剩 v3 之後才執行
SET lock_timeout = '1min';
ALTER TABLE customers DROP COLUMN phone;

-- Down Migration
-- 刪掉的資料回不來：down 只能把欄位加回來，值要從 mobile 補
ALTER TABLE customers ADD COLUMN phone text;
UPDATE customers SET phone = mobile;
