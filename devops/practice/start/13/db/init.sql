-- 資料庫第一次初始化時執行一次（掛在 /docker-entrypoint-initdb.d）
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
  ordered_at  timestamptz NOT NULL DEFAULT now(),
  total       integer NOT NULL CHECK (total >= 0),
  note        text
);
