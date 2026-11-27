alter table orders enable row level security;
-- 結果正確，但 auth.uid() 沒包 (select …)：每一列都重算一次
create policy "顧客讀自己的訂單" on orders for select to authenticated using (customer_id = auth.uid());
grant select on orders to authenticated;
create index orders_customer_id_idx on orders (customer_id);
