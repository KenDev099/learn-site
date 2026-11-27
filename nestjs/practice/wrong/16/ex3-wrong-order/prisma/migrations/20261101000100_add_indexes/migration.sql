-- CreateIndex
CREATE INDEX "orders_ordered_at_customer_id_idx" ON "orders"("ordered_at", "customer_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

