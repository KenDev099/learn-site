-- JWT 最外層的 role 是資料庫角色（authenticated），不是店長這種應用程式的角色
create policy "店長看全部訂單" on public.orders for select to authenticated
  using (((select auth.jwt()) ->> 'role') = 'manager');
