-- 資料庫第一次初始化時執行（/docker-entrypoint-initdb.d，資料目錄是空的才會跑），由 postgres 超級使用者執行
-- 建兩個登入帳號，密碼從 db 容器的環境變數讀（psql 的 \getenv）：
-- - cafe_migrator：資料庫 cafe 的擁有者，可以建表、改表（給 migration 用）
-- - cafe_app：給 api 用，它能做什麼由 02-grants.sql 決定
\getenv migrator_pw MIGRATOR_PASSWORD
\getenv app_pw APP_PASSWORD
CREATE ROLE cafe_migrator LOGIN PASSWORD :'migrator_pw';
CREATE ROLE cafe_app LOGIN PASSWORD :'app_pw';
-- PostgreSQL 15 起 public schema 的擁有者是 pg_database_owner（＝資料庫擁有者），其他人預設沒有 CREATE
ALTER DATABASE cafe OWNER TO cafe_migrator;
