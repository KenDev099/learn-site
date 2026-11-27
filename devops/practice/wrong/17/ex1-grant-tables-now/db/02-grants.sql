-- 錯誤：只對「現在已經存在」的表授權，這時候還沒有任何表，之後 migration 建的表 cafe_app 都沒有權限
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cafe_app;
