-- Up Migration
CREATE TABLE customers (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL,
  phone text
);

-- Down Migration
DROP TABLE customers;
