-- 資料庫第一次初始化時執行（/docker-entrypoint-initdb.d，資料目錄是空的才會跑），由 postgres 超級使用者執行。這個檔不用改
-- 建兩個登入帳號（第 17 課），密碼從 Compose secrets 掛進來的檔案讀（psql 的 \set 可以用反引號執行指令）：
-- - cafe_migrator：資料庫 cafe 的擁有者，可以建表、改表（給 migrate 用）
-- - cafe_app：給 api 用，只能讀寫資料
\set migrator_pw `cat /run/secrets/migrator_password`
\set app_pw `cat /run/secrets/app_password`
CREATE ROLE cafe_migrator LOGIN PASSWORD :'migrator_pw';
CREATE ROLE cafe_app LOGIN PASSWORD :'app_pw';
ALTER DATABASE cafe OWNER TO cafe_migrator;
-- cafe_migrator 之後建的表與序列，自動給 cafe_app 讀寫權限；cafe_app 沒有任何 CREATE
ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cafe_app;
