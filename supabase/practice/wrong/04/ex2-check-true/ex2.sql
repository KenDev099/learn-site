-- with check (true)：誰的訂單都能新增
create policy "新增訂單" on orders for insert to authenticated with check (true);
grant insert on orders to authenticated;
