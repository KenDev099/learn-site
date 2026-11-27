-- 開發用的種子資料：npx prisma db seed
TRUNCATE customers, categories, products, orders, order_items, stamp_cards, point_transactions,
  webhook_events, idempotency_keys, outbox_events RESTART IDENTITY CASCADE;

INSERT INTO categories (name) VALUES ('咖啡'), ('茶'), ('點心');
INSERT INTO products (category_id, name, price, stock) VALUES
  (1, '美式咖啡', 80, 50), (1, '拿鐵', 110, 50), (1, '卡布奇諾', 110, 50),
  (2, '伯爵紅茶', 90, 30), (3, '可頌', 70, 20), (3, '起司蛋糕', 120, 10);
INSERT INTO customers (name, email) VALUES
  ('王小明', 'ming@example.com'), ('陳美華', 'meihua@example.com'), ('林志豪', 'chihhao@example.com'),
  ('張雅婷', 'yating@example.com'), ('李建國', 'chienkuo@example.com'), ('黃淑芬', 'shufen@example.com');
