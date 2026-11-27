-- 練習 1：測試已經在你的 schema 建好兩張表（不用 create table，也不要寫 public. 前綴）：
--   products(id, name, price)：菜單，已經有 6 筆資料
--   orders(id, customer_id uuid default auth.uid(), total, note)：訂單

-- 下單的 policy 先給你（auth.uid() 是這個請求的使用者 id，第 4 課細講）：
create policy "登入的人用自己的身分下單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));

alter table products enable row level security;
alter table orders enable row level security;

create policy "菜單公開可讀" on products for select to anon, authenticated using (true);

grant select on products to anon, authenticated;
grant insert on orders to authenticated;
