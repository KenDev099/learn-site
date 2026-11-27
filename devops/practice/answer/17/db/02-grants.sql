-- cafe_app 只能讀寫資料：之後 cafe_migrator 在 public 建的表和序列，自動給這些權限
-- （ALTER DEFAULT PRIVILEGES 只影響「之後」由 cafe_migrator 建立的物件，所以要在 migration 之前執行）
ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafe_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cafe_app;
-- 不給 cafe_app 任何 CREATE：PostgreSQL 15 起 public schema 預設就沒有開給所有人建表
