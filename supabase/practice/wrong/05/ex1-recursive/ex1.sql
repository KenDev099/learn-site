create table public.store_members (store_id integer not null references public.stores (id), user_id uuid not null, role text not null default 'staff', primary key (store_id, user_id));
alter table public.store_members enable row level security;
alter table public.orders enable row level security;
-- store_members 的 policy 直接查 store_members：每次讀都要再套用自己的 policy，無限遞迴（42P17）
create policy "看得到同分店的同事" on public.store_members for select to authenticated
  using (store_id in (select store_id from public.store_members where user_id = (select auth.uid())));
create policy "看得到自己分店的訂單" on public.orders for select to authenticated
  using (store_id in (select store_id from public.store_members where user_id = (select auth.uid())));
grant select on public.store_members, public.orders to authenticated;
