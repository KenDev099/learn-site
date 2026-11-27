-- 打錯表名（order_itemz）：這個 migration 一定會失敗
CREATE INDEX order_items_order_id_idx ON order_itemz (order_id);
