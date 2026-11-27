-- 種子資料：npx prisma db seed（可以重複執行）
INSERT INTO categories (id, name) VALUES (1, '咖啡'), (2, '茶'), (3, '點心')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, price, cost_price, category_id) VALUES
  (1, '美式咖啡', 80, 22, 1),
  (2, '拿鐵', 110, 35, 1),
  (3, '卡布奇諾', 110, 34, 1),
  (4, '伯爵紅茶', 90, 18, 2),
  (5, '可頌', 70, 28, 3),
  (6, '起司蛋糕', 120, 45, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, name, phone) VALUES
  (1, '王小明', '0912000001'),
  (2, '陳美華', '0912000002'),
  (3, '林志豪', '0912000003'),
  (4, '張雅婷', '0912000004'),
  (5, '李建國', '0912000005'),
  (6, '黃淑芬', '0912000006')
ON CONFLICT (id) DO NOTHING;

-- 指定了 id，序號要跟上，之後的 INSERT 才不會撞到
SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT max(id) FROM categories));
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products));
SELECT setval(pg_get_serial_sequence('customers', 'id'), (SELECT max(id) FROM customers));
