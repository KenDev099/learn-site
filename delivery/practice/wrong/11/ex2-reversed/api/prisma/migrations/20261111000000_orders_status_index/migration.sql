-- 廚房看板（WHERE status IN ('paid', 'preparing') ORDER BY ordered_at）用的索引
-- CONCURRENTLY：建索引時不鎖住寫入，尖峰時段也能下單。不能放在交易裡，所以這個檔案只有這一句
CREATE INDEX CONCURRENTLY "orders_status_ordered_at_idx" ON "orders"("ordered_at", "status");
