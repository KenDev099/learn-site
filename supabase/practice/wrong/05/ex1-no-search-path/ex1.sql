create table public.store_members (store_id integer not null references public.stores (id), user_id uuid not null, role text not null default 'staff', primary key (store_id, user_id));
alter table public.store_members enable row level security;
alter table public.orders enable row level security;
-- security definer 卻沒鎖 search_path
create function private.my_store_ids() returns setof integer language sql stable security definer
as $$ select store_id from public.store_members where user_id = (select auth.uid()) $$;
revoke execute on function private.my_store_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.my_store_ids() to authenticated;
create policy "看得到同分店的同事" on public.store_members for select to authenticated using (store_id in (select private.my_store_ids()));
create policy "看得到自己分店的訂單" on public.orders for select to authenticated using (store_id in (select private.my_store_ids()));
grant select on public.store_members, public.orders to authenticated;
