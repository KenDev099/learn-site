-- 開發用的種子資料：npx prisma db seed
TRUNCATE products, orders, order_items, stamp_cards, point_transactions RESTART IDENTITY CASCADE;

INSERT INTO products (name, price) VALUES
  ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);
