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

-- CAFE-29 優惠券（說明由行銷提供，可以用 <b> 標粗體）
INSERT INTO coupons (code, description, percent_off, max_uses) VALUES
  ('OPEN10', '<b>開幕週</b>全品項 9 折', 10, 500),
  ('VIP50', '<b>老顧客限定</b>半價，只有 1 張', 50, 1)
ON CONFLICT (code) DO NOTHING;

-- 指定了 id，序號要跟上，之後的 INSERT 才不會撞到
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products));
SELECT setval(pg_get_serial_sequence('customers', 'id'), (SELECT max(id) FROM customers));
