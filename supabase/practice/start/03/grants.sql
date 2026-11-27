-- 練習 1：測試已經在你的 schema 建好兩張表（不用 create table，也不要寫 public. 前綴）：
--   products(id, name, price)：菜單，已經有 6 筆資料
--   orders(id, customer_id uuid default auth.uid(), total, note)：訂單
-- 要做到：
--   1. 沒登入（anon）和登入的人（authenticated）都能讀菜單；任何人都不能透過 API 改菜單
--   2. 登入的人能新增訂單，而且只能用自己的身分下單；沒登入的人不能新增；訂單先不開放讀取（第 4 課再開）
--   3. 兩張表都要開 RLS

-- 下單的 policy 先給你（auth.uid() 是這個請求的使用者 id，第 4 課細講）：
create policy "登入的人用自己的身分下單" on orders for insert to authenticated
  with check (customer_id = (select auth.uid()));

-- 在下面寫：開 RLS、菜單的 policy、GRANT
