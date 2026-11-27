alter table orders enable row level security;
-- using (true)：每一列都看得到
create policy "讀訂單" on orders for select using (true);
grant select on orders to anon, authenticated;
create index orders_customer_id_idx on orders (customer_id);
