create policy "登入的人用自己的身分下單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));
alter table products enable row level security;
alter table orders enable row level security;
create policy "菜單公開可讀" on products for select to anon, authenticated using (true);
-- 圖方便：全部權限都給
grant all on products to anon, authenticated;
grant all on orders to authenticated;
