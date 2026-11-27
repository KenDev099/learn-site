-- CreateIndex
CREATE INDEX "orders_customer_id_ordered_at_idx" ON "orders"("customer_id", "ordered_at");


