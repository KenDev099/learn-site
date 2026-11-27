-- CreateIndex
CREATE INDEX "orders_customer_id_ordered_at_idx" ON "orders"("customer_id", "ordered_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

