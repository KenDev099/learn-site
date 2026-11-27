-- 開發用資料：npx prisma db seed。所有帳號的密碼都是 latte-110-please
TRUNCATE refresh_tokens, users, orders, products, customers RESTART IDENTITY CASCADE;

INSERT INTO customers (name) VALUES ('王小明'), ('陳美華');
INSERT INTO products (name, price) VALUES
  ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);
INSERT INTO orders (customer_id, total, status) VALUES (1, 190, 'pending'), (2, 110, 'pending'), (1, 80, 'pending');
INSERT INTO users (email, password_hash, role, customer_id) VALUES
  ('wang@coffee.example', '$argon2id$v=19$m=19456,t=2,p=1$BlGJJtxr+5gS72F4xFNuYg$2YrsVMqEszCNXpCcD5P0il1hmf8u66fPMKbQ/URzZio', 'customer', 1),
  ('chen@coffee.example', '$argon2id$v=19$m=19456,t=2,p=1$BlGJJtxr+5gS72F4xFNuYg$2YrsVMqEszCNXpCcD5P0il1hmf8u66fPMKbQ/URzZio', 'customer', 2),
  ('lin@coffee.example', '$argon2id$v=19$m=19456,t=2,p=1$BlGJJtxr+5gS72F4xFNuYg$2YrsVMqEszCNXpCcD5P0il1hmf8u66fPMKbQ/URzZio', 'barista', NULL),
  ('zhang@coffee.example', '$argon2id$v=19$m=19456,t=2,p=1$BlGJJtxr+5gS72F4xFNuYg$2YrsVMqEszCNXpCcD5P0il1hmf8u66fPMKbQ/URzZio', 'manager', NULL);
