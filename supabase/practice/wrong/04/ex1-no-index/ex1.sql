alter table orders enable row level security;
create policy "顧客讀自己的訂單" on orders for select to authenticated using (customer_id = (select auth.uid()));
grant select on orders to authenticated;
-- 忘了 customer_id 的索引
