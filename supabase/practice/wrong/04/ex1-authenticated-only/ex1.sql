alter table orders enable row level security;
-- 只限制「有登入」，沒有擁有者條件：任何登入的人都看得到所有訂單（BOLA）
create policy "登入的人讀訂單" on orders for select to authenticated using (true);
grant select on orders to authenticated;
create index orders_customer_id_idx on orders (customer_id);
