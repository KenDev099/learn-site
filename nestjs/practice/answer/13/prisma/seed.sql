-- 種子資料：ON CONFLICT (name) DO NOTHING 讓它可以重複執行（已經有同名的就跳過）
INSERT INTO categories (name) VALUES ('咖啡'), ('茶'), ('甜點')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, price, category_id) VALUES
  ('美式咖啡', 80, (SELECT id FROM categories WHERE name = '咖啡')),
  ('拿鐵', 110, (SELECT id FROM categories WHERE name = '咖啡')),
  ('卡布奇諾', 110, (SELECT id FROM categories WHERE name = '咖啡')),
  ('伯爵紅茶', 90, (SELECT id FROM categories WHERE name = '茶')),
  ('可頌', 70, (SELECT id FROM categories WHERE name = '甜點')),
  ('起司蛋糕', 120, (SELECT id FROM categories WHERE name = '甜點'))
ON CONFLICT (name) DO NOTHING;
