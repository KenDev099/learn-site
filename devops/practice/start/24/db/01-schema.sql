-- 第一次啟動時建立咖啡店的表與基本資料。這個檔不用改
CREATE TABLE customers (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE products (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  price integer NOT NULL CHECK (price > 0)
);
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id),
  ordered_at  timestamptz NOT NULL DEFAULT now(),
  total       integer NOT NULL DEFAULT 0
);
CREATE TABLE order_items (
  order_id   bigint NOT NULL REFERENCES orders (id),
  product_id bigint NOT NULL REFERENCES products (id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
INSERT INTO products (name, price) VALUES
  ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120);
INSERT INTO customers (name) VALUES
  ('王小明'), ('陳美華'), ('林志豪'), ('張雅婷'), ('李建國'), ('黃淑芬');
