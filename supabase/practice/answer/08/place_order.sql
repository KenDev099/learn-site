-- 練習 1：結帳用的資料庫函式 public.place_order(items jsonb) returns integer（新訂單的 id）
-- 預設是 security invoker：以呼叫的人的身分執行，orders、order_items 的 RLS 照樣檢查
create function public.place_order(items jsonb) returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  order_total integer;
  found_count integer;
  new_id integer;
begin
  if uid is null then
    raise exception '請先登入' using errcode = '42501';
  end if;

  -- 價格從資料庫讀，不看前端傳的 unit_price
  select sum(p.price * (i ->> 'quantity')::integer), count(*)
    into order_total, found_count
    from jsonb_array_elements(items) as i
    join public.products p on p.id = (i ->> 'product_id')::integer;
  if found_count is distinct from jsonb_array_length(items) or found_count = 0 then
    raise exception '有商品不存在' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_id, total) values (uid, order_total) returning id into new_id;
  insert into public.order_items (order_id, product_id, quantity, unit_price)
    select new_id, p.id, (i ->> 'quantity')::integer, p.price
      from jsonb_array_elements(items) as i
      join public.products p on p.id = (i ->> 'product_id')::integer;
  return new_id;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
