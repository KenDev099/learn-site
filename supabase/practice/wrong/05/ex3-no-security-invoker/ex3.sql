-- view 預設以建立者（postgres）的身分讀 orders，繞過 RLS
create view public.store_report as
  select store_id, count(*) as order_count, sum(total) as revenue from public.orders group by store_id;
grant select on public.store_report to authenticated;
