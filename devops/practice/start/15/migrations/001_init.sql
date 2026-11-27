-- Up Migration
CREATE TABLE products (
  id    integer PRIMARY KEY,
  name  text NOT NULL,
  price integer NOT NULL
);
INSERT INTO products VALUES
  (1, '美式咖啡', 80), (2, '拿鐵', 110), (3, '卡布奇諾', 110),
  (4, '伯爵紅茶', 90), (5, '可頌', 70), (6, '起司蛋糕', 120);

CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer,
  ordered_at  timestamptz NOT NULL DEFAULT now(),
  total       integer NOT NULL CHECK (total >= 0)
);

CREATE TABLE order_items (
  order_id   bigint NOT NULL REFERENCES orders,
  product_id integer NOT NULL REFERENCES products,
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

-- Down Migration
DROP TABLE order_items;
DROP TABLE orders;
DROP TABLE products;
