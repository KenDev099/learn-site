-- 咖啡店的基本資料，和 PostgreSQL 課第 25 課一致。各課需要的欄位（例如庫存）在自己的 schema.sql 加上去
CREATE TABLE customers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  phone text,
  city text
);
INSERT INTO customers (name, phone, city) VALUES
  ('王小明', '0912-345-678', '台北'), ('陳美華', '0922-111-222', '台中'),
  ('林志豪', '0933-222-333', '台北'), ('張雅婷', '0955-666-777', '高雄'),
  ('李建國', '0966-777-888', '台南'), ('黃淑芬', '0977-888-999', '台北');

CREATE TABLE products (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  price integer NOT NULL
);
INSERT INTO products (name, price) VALUES
  ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);

CREATE TABLE orders (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id),
  ordered_at timestamptz NOT NULL,
  total integer NOT NULL
);
INSERT INTO orders (customer_id, ordered_at, total) VALUES
  (1, '2026-10-20 08:30+08', 190), (2, '2026-10-20 10:15+08', 220),
  (1, '2026-10-21 09:00+08', 150), (3, '2026-10-21 14:20+08', 110),
  (4, '2026-10-22 11:45+08', 200), (2, '2026-10-23 16:00+08', 200),
  (1, '2026-10-24 08:10+08', 80), (5, '2026-10-25 13:30+08', 240);

CREATE TABLE order_items (
  order_id integer NOT NULL REFERENCES orders(id),
  product_id integer NOT NULL REFERENCES products(id),
  quantity integer NOT NULL,
  unit_price integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
INSERT INTO order_items VALUES
  (1, 1, 1, 80), (1, 2, 1, 110),
  (2, 2, 2, 110),
  (3, 1, 1, 80), (3, 5, 1, 70),
  (4, 3, 1, 110),
  (5, 4, 1, 90), (5, 3, 1, 110),
  (6, 6, 1, 120), (6, 1, 1, 80),
  (7, 1, 1, 80),
  (8, 6, 2, 120);
