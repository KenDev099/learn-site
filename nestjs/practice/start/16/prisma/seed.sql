-- 種子資料：npx prisma db seed（可以重複執行：先清空再放）
TRUNCATE order_items, orders, customers, products RESTART IDENTITY CASCADE;

INSERT INTO products (name, price) VALUES
  ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);

INSERT INTO customers (name, phone) VALUES
  ('王小明', '0912000001'), ('陳美華', '0912000002'), ('林志豪', '0912000003'),
  ('張雅婷', '0912000004'), ('李建國', '0912000005'), ('黃淑芬', '0912000006');

-- 2026-10-01 起，每 90 分鐘一張訂單，共 200 張；每張兩杯，金額由明細算出
INSERT INTO orders (customer_id, total, ordered_at)
SELECT (i % 6) + 1, 0, timestamptz '2026-10-01 08:00:00+08' + (i * interval '90 minutes')
FROM generate_series(0, 199) AS i;

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT o.id, p.id, 1, p.price
FROM orders o
JOIN products p ON p.id IN ((o.id % 6) + 1, ((o.id + 3) % 6) + 1);

UPDATE orders o SET total = s.sum
FROM (SELECT order_id, SUM(quantity * unit_price) AS sum FROM order_items GROUP BY order_id) s
WHERE s.order_id = o.id;
