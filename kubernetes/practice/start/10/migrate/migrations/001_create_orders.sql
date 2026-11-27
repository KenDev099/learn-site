CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL
);
