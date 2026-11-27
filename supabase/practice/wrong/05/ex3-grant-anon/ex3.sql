create view public.store_report with (security_invoker = true) as
  select store_id, count(*) as order_count, sum(total) as revenue from public.orders group by store_id;
-- 報表給了 anon
grant select on public.store_report to anon, authenticated;
