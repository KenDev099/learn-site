alter table orders enable row level security;

create policy "顧客讀自己的訂單" on orders for select to authenticated
  using (customer_id = (select auth.uid()));

grant select on orders to authenticated;

create index orders_customer_id_idx on orders (customer_id);
