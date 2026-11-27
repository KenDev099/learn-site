-- 煙霧測試：還原出來的資料庫，app 最常做的事都要做得到。有問題就 RAISE，psql 加 -v ON_ERROR_STOP=1 會以非 0 結束
DO $$
BEGIN
  IF (SELECT count(*) FROM products) = 0 THEN
    RAISE EXCEPTION '菜單是空的';
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id
    GROUP BY o.id, o.total
    HAVING o.total <> coalesce(sum(i.quantity * i.unit_price), 0)
  ) THEN
    RAISE EXCEPTION '有訂單的總額跟明細加總不一樣';
  END IF;
END $$;
-- app 的「最近 30 天每日營收」查詢
SELECT date_trunc('day', ordered_at) AS day, sum(total) FROM orders
WHERE ordered_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1 DESC LIMIT 3;
