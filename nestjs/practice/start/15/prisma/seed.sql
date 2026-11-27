-- 開發用的種子資料：npx prisma db seed。拿鐵只剩 5 杯，方便你自己重現超賣
TRUNCATE products, orders, order_items, stamp_cards, point_transactions RESTART IDENTITY CASCADE;

INSERT INTO products (name, price, stock) VALUES
  ('美式咖啡', 80, 50),
  ('拿鐵', 110, 5),
  ('卡布奇諾', 110, 50),
  ('伯爵紅茶', 90, 50),
  ('可頌', 70, 30),
  ('起司蛋糕', 120, 2);

INSERT INTO stamp_cards (customer_name) VALUES ('王小明');
INSERT INTO point_transactions (card_id, points, reason) VALUES (1, 6, '消費'), (1, 4, '消費');
