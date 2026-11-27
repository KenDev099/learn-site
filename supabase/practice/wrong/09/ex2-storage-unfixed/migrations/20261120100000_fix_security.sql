-- 練習 2：修好練習 1 找到的四個漏洞。這是一個新的 migration：已經上線的 20261120090000_cafe_orders.sql 不能改
-- 功能要維持：顧客讀自己的訂單、改自己訂單的備註、看自己的消費統計、rpc('customer_spend', { customer: 自己的 id })、上傳自己的收據

-- 1. view 預設以建立者（postgres）的權限查詢，繞過 RLS：改成以查詢者的身分執行
alter view public.order_report set (security_invoker = true);

-- 2. 店員的判斷讀 user_metadata：任何顧客都能用 updateUser 把自己改成 staff。角色要放只有伺服器改得到的 app_metadata
alter policy "店員讀全部訂單" on public.orders
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'staff');

-- 3. 上傳沒檢查路徑：別人能把檔案放進我的資料夾


-- 4. security definer 函式放在公開的 schema、沒檢查呼叫者：任何人都查得到別人的消費。
--    它不需要特權：改成 security invoker，RLS 只讓呼叫者算到自己的訂單；沒登入的人不能執行
alter function public.customer_spend(uuid) security invoker;
revoke execute on function public.customer_spend(uuid) from public, anon;
grant execute on function public.customer_spend(uuid) to authenticated;
