-- CAFE-33 的核對查詢（練習 3）：每一列是一個還沒解決的問題，修復完成後要回傳 0 列
--   duplicate：這張訂單還有重複點數沒扣回（不扣回的顧客除外）
--   negative ：顧客的點數變成負的（扣過頭）
-- 執行：docker compose exec -T postgres psql -U learn -d <資料庫> < scripts/verify-points.sql
WITH dup AS (
  SELECT t.customer_id, t.order_id, t.points FROM (
    SELECT id, customer_id, order_id, points,
           row_number() OVER (PARTITION BY order_id ORDER BY id) AS n
    FROM point_entries
    WHERE reason = 'order_paid'
  ) t
  WHERE t.n > 1
    AND NOT EXISTS (SELECT 1 FROM point_entries r WHERE r.reversal_of = t.id)
),
balance AS (
  SELECT customer_id, sum(points) AS points FROM point_entries GROUP BY customer_id
),
fixable AS (   -- 扣回後點數不會變負的顧客：這些人的重複應該已經扣回
  SELECT d.customer_id FROM dup d JOIN balance b USING (customer_id)
  GROUP BY d.customer_id, b.points
  HAVING b.points - sum(d.points) >= 0
)
SELECT 'duplicate' AS problem, d.customer_id, d.order_id, count(*) AS detail
FROM dup d
WHERE d.customer_id NOT IN (23, 41, 64, 72, 73, 85, 101, 137)
GROUP BY d.customer_id, d.order_id
UNION ALL
SELECT 'negative', customer_id, NULL, points FROM balance WHERE points < 0
ORDER BY problem, customer_id, order_id;
