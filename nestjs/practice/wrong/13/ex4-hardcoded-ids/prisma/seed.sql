-- 錯誤寫法：寫死 category_id，資料庫裡已經有別的分類時就指錯
INSERT INTO categories (name) VALUES ('咖啡'), ('茶'), ('甜點')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, price, category_id) VALUES
  ('美式咖啡', 80, 1), ('拿鐵', 110, 1), ('卡布奇諾', 110, 1),
  ('伯爵紅茶', 90, 2), ('可頌', 70, 3), ('起司蛋糕', 120, 3)
ON CONFLICT (name) DO NOTHING;
