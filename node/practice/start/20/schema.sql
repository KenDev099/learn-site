-- 第 20 課：在 coffee.sql 之上加庫存，以及顧客的約束
ALTER TABLE products ADD COLUMN stock integer NOT NULL DEFAULT 100;
ALTER TABLE customers ADD CONSTRAINT customers_phone_key UNIQUE (phone);
ALTER TABLE customers ADD CONSTRAINT customers_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 50);
