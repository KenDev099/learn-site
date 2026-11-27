-- 用 user_metadata 判斷：使用者自己就能改 user_metadata
create policy "店長看全部訂單" on public.orders for select to authenticated
  using (((select auth.jwt()) -> 'user_metadata' ->> 'role') = 'manager');
