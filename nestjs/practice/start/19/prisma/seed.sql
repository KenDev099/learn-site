-- 種子資料：npx prisma db seed（可以重複執行：先清空再放）
TRUNCATE orders, customers, products RESTART IDENTITY CASCADE;

INSERT INTO products (name, price, category) VALUES
  ('美式咖啡', 80, 'coffee'), ('拿鐵', 110, 'coffee'), ('卡布奇諾', 110, 'coffee'),
  ('伯爵紅茶', 90, 'tea'), ('可頌', 70, 'food'), ('起司蛋糕', 120, 'food');

INSERT INTO customers (name, phone) VALUES
  ('王小明', '0912000001'), ('陳美華', '0912000002'), ('林志豪', '0912000003'),
  ('張雅婷', '0912000004'), ('李建國', '0912000005'), ('黃淑芬', '0912000006');

INSERT INTO orders (customer_id, total, ordered_at)
SELECT (i % 6) + 1, 80 + (i % 4) * 30, timestamptz '2026-10-01 08:00:00+08' + (i * interval '90 minutes')
FROM generate_series(0, 59) AS i;
