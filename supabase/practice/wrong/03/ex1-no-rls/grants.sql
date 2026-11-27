-- 只 GRANT，沒開 RLS：policy 寫了也不會生效
create policy "登入的人用自己的身分下單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));
create policy "菜單公開可讀" on products for select to anon, authenticated using (true);
grant select on products to anon, authenticated;
grant insert on orders to authenticated;
