create policy "店長看全部訂單" on public.orders for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'manager');
