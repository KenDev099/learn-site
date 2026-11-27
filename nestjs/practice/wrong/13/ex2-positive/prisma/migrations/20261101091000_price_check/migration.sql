-- Prisma schema 寫不出 CHECK 約束，所以用 --create-only 產生空的 migration，自己補 SQL
ALTER TABLE "products" ADD CONSTRAINT "products_price_check" CHECK ("price" > 0);
