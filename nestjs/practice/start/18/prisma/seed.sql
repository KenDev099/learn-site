-- 開發用的種子資料：npx prisma db seed。王小明有集點卡，陳美華沒有（練習 3 用來試「加點失敗，付款也要回滾」）
TRUNCATE customers, orders, stamp_cards, point_transactions RESTART IDENTITY CASCADE;

INSERT INTO customers (name) VALUES ('王小明'), ('陳美華');
INSERT INTO stamp_cards (customer_id) VALUES (1);
INSERT INTO orders (customer_id, total, status) VALUES
  (1, 190, 'pending'),
  (1, 110, 'completed'),
  (2, 80, 'pending');
