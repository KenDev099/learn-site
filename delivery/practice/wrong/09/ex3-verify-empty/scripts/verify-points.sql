-- CAFE-33 的核對查詢（練習 3）：每一列是一個還沒解決的問題，修復完成後要回傳 0 列
--   每一張「還有重複點數沒扣回、而且應該扣回」的訂單一列（不扣回的顧客不算問題）
-- 執行：docker compose exec -T postgres psql -U learn -d <資料庫> < scripts/verify-points.sql
-- TODO：換成真正的檢查
SELECT 1 AS todo WHERE false;
