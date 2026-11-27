-- 咖啡店點餐上線的 migration（已經套用到正式環境，不要改這個檔：修正寫在新的 migration）
-- 訂單：顧客讀自己的、替自己下單、改自己訂單的備註；店員讀全部
create table public.orders (
  id integer generated always as identity primary key,
  customer_id uuid not null references auth.users (id) on delete cascade,
  total integer not null check (total >= 0),
  note text not null default ''
);
create index orders_customer_id_idx on public.orders (customer_id);
alter table public.orders enable row level security;

create policy "顧客讀自己的訂單" on public.orders for select to authenticated
  using (customer_id = (select auth.uid()));
create policy "顧客替自己下單" on public.orders for insert to authenticated
  with check (customer_id = (select auth.uid()));
create policy "顧客改自己訂單的備註" on public.orders for update to authenticated
  using (customer_id = (select auth.uid()));
create policy "店員讀全部訂單" on public.orders for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff');
grant select, insert on public.orders to authenticated;
grant update (note) on public.orders to authenticated;

-- 「我的消費統計」頁用的報表
create view public.order_report with (security_invoker = true) as
  select customer_id, count(*)::integer as orders, sum(total)::integer as revenue
  from public.orders
  group by customer_id;
grant select on public.order_report to authenticated;

-- 會員等級要用的累積消費：前端呼叫 rpc('customer_spend', { customer: 自己的 id })
create function public.customer_spend(customer uuid) returns integer
language sql
security invoker
set search_path = ''
as $$
  select coalesce(sum(total), 0)::integer from public.orders where customer_id = customer;
$$;

-- 轉帳收據：路徑是 <user_id>/<檔名>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/png', 'image/jpeg']);
create policy "收據：顧客上傳" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "收據：顧客讀自己的" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke execute on function public.customer_spend(uuid) from public, anon;
grant execute on function public.customer_spend(uuid) to authenticated;
