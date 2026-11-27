-- 開發用的種子資料：npx prisma db seed。王小明有集點卡，陳美華沒有（付款會失敗、整個交易回滾）
-- 林志豪的集點卡最後一筆紀錄在一年多以前：練習 1 的點數過期會讓它歸零
-- 付款紀錄：訂單 1 付款成功但還是 pending（練習 3 的對帳會修好），訂單 2 是 completed 卻沒有付款紀錄（只回報）
TRUNCATE customers, orders, payments, stamp_cards, point_transactions, reconciliation_fixes, job_checkpoints, kitchen_notices, daily_stats RESTART IDENTITY CASCADE;

INSERT INTO customers (name) VALUES ('王小明'), ('陳美華'), ('林志豪');
INSERT INTO stamp_cards (customer_id) VALUES (1), (3);
INSERT INTO point_transactions (card_id, points, reason, created_at) VALUES
  (1, 3, '消費', now() - interval '20 days'),
  (2, 5, '消費', now() - interval '400 days'),
  (2, -2, '兌換', now() - interval '380 days');
INSERT INTO orders (customer_id, total, status) VALUES
  (1, 190, 'pending'),
  (1, 110, 'completed'),
  (2, 80, 'pending');
INSERT INTO payments (order_id, amount, status) VALUES
  (1, 190, 'failed'),
  (1, 190, 'succeeded');
