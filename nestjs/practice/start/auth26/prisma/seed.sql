-- 開發用的資料：npx prisma db seed（每個帳號的密碼都是 latte-art-2026）
-- 先清空再灌，可以重複執行
TRUNCATE tenants, stores, users, orders, products, refresh_tokens, password_resets RESTART IDENTITY CASCADE;

INSERT INTO tenants (name) VALUES ('豆香咖啡'), ('山嵐咖啡');
INSERT INTO stores (tenant_id, name) VALUES (1, '豆香信義店'), (1, '豆香大安店'), (2, '山嵐中山店'), (2, '山嵐板橋店');

INSERT INTO users (tenant_id, store_id, email, password_hash, role, name, phone, points, mfa_secret) VALUES
  (1, NULL, 'manager@douxiang.example', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'manager', '張雅婷', NULL, 0, NULL),
  (1, 1, 'xinyi@douxiang.example', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'barista', '李建國', NULL, 0, NULL),
  (1, 2, 'daan@douxiang.example', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'barista', '黃淑芬', NULL, 0, NULL),
  (2, NULL, 'manager@shanlan.example', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'manager', '周文傑', NULL, 0, NULL),
  (2, 3, 'zhongshan@shanlan.example', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'barista', '吳佩珊', NULL, 0, NULL),
  (1, 1, 'wang@example.com', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'customer', '王小明', '0912345678', 120, 'JBSWY3DPEHPK3PXP'),
  (1, 2, 'chen@example.com', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'customer', '陳美華', '0923456789', 40, NULL),
  (2, 3, 'lin@example.com', '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw', 'customer', '林志豪', '0934567890', 300, 'KRSXG5CTMVRXEZLU');

INSERT INTO orders (store_id, customer_id, total) VALUES (1, 6, 190), (1, 6, 80), (2, 7, 110), (3, 8, 200), (4, 8, 70);
INSERT INTO products (tenant_id, name, price) VALUES (1, '美式咖啡', 80), (1, '拿鐵', 110), (2, '卡布奇諾', 110), (2, '可頌', 70);
