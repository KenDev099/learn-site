create policy "顧客新增自己的訂單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));

grant insert on orders to authenticated;
