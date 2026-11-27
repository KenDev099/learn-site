-- 種子資料：npm run db:setup 會執行（可以重複執行）
INSERT INTO products (id, name, price, available) VALUES
  (1, '美式咖啡', 80, true),
  (2, '拿鐵', 110, true),
  (3, '卡布奇諾', 110, true),
  (4, '伯爵紅茶', 90, true),
  (5, '可頌', 70, true),
  (6, '起司蛋糕', 120, true),
  (7, '桂花烏龍（季節限定）', 100, false)
ON CONFLICT (id) DO NOTHING;

-- 舊 POS 的商品代碼（搬資料時留下來的）
UPDATE products SET legacy_sku = 'POS-' || lpad(id::text, 4, '0') WHERE legacy_sku IS NULL;

INSERT INTO customers (id, name) VALUES
  (1, '王小明'), (2, '陳美華'), (3, '林志豪'), (4, '張雅婷'), (5, '李建國'), (6, '黃淑芬')
ON CONFLICT (id) DO NOTHING;

-- 功能旗標：CafePay SDK 2.0 一開始是 0%（全部走 1.4.2）
INSERT INTO feature_flags (key, percent) VALUES ('payments.sdk_v2', 0) ON CONFLICT (key) DO NOTHING;
-- v2.8.0：店員訂單搜尋（CAFE-41）。100＝開、0＝關（npm run flag -- orders.search on|off）
INSERT INTO feature_flags (key, percent) VALUES ('orders.search', 100) ON CONFLICT (key) DO NOTHING;

-- 示範帳號（v2.8.0，SEC-7）：顧客 customer1～customer6 的密碼是 latte-1～latte-6，店員 counter 的密碼是 barista-7
-- 只用在開發與測試；正式環境的帳號由顧客自己註冊
INSERT INTO accounts (id, username, password_hash, role, customer_id) VALUES
  (1, 'customer1', 'scrypt$cafe-salt-c1$4e96916fbeb2e832189d80971cc9f7d2781987b4cd3d4305502b74a3fb64d277', 'customer', 1),
  (2, 'customer2', 'scrypt$cafe-salt-c2$584c78954b1cd2a99cb9b5ef6ac9cb056e7511f552ae6c80108d898cb7b9c657', 'customer', 2),
  (3, 'customer3', 'scrypt$cafe-salt-c3$efb5ea30a8a6943807a85d286e55544abd8fe179f986d236db4b4d02a2328af1', 'customer', 3),
  (4, 'customer4', 'scrypt$cafe-salt-c4$4318479f4ef0efd3c7a5b89058372cc4d883c9bb196085c0b262ffffef4d457c', 'customer', 4),
  (5, 'customer5', 'scrypt$cafe-salt-c5$cceeafe9967cddc3a93012f20e429c20d3b060bc3842dec9c3af8ef71c244a35', 'customer', 5),
  (6, 'customer6', 'scrypt$cafe-salt-c6$72cad653531e9875f3da52f046ea3596c6196a7008dd5b165eaa6bf8f20c838c', 'customer', 6),
  (7, 'counter', 'scrypt$cafe-salt-s7$f293ffc25275baeef2586723b6ec2e7b551e8782a9598d65c976b71f3f445d63', 'staff', NULL)
ON CONFLICT (id) DO NOTHING;

-- 指定了 id，序號要跟上，之後的 INSERT 才不會撞到
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products));
SELECT setval(pg_get_serial_sequence('customers', 'id'), (SELECT max(id) FROM customers));
SELECT setval(pg_get_serial_sequence('accounts', 'id'), (SELECT max(id) FROM accounts));
