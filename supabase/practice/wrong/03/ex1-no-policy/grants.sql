create policy "登入的人用自己的身分下單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));
-- 開了 RLS、給了 GRANT，菜單卻沒有 policy：一列都看不到
alter table products enable row level security;
alter table orders enable row level security;
grant select on products to anon, authenticated;
grant insert on orders to authenticated;
