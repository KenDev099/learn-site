-- Up Migration
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer,
  ordered_at  timestamptz NOT NULL DEFAULT now(),
  total       integer NOT NULL CHECK (total >= 0)
);
INSERT INTO orders (customer_id, total) SELECT g % 6 + 1, 80 + g % 5 * 10 FROM generate_series(1, 1000) g;

-- Down Migration
DROP TABLE orders;
