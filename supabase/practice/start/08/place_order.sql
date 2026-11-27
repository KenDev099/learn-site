-- 練習 1：結帳用的資料庫函式 public.place_order(items jsonb) returns integer（新訂單的 id）
-- items 長這樣：[{ "product_id": 2, "quantity": 2 }, { "product_id": 5, "quantity": 1 }]（前端可能多傳 unit_price，不能採用）
-- 1. 沒登入（auth.uid() 是 null）就 raise exception
-- 2. 單價一律從 public.products 讀；有商品不存在就 raise exception（整筆都不能留下來）
-- 3. 新增一張 orders（customer_id 是呼叫的人、total 是總價）和每一個 order_items，回傳訂單 id
-- 4. 只有登入的人能呼叫：revoke execute … from public, anon；grant execute … to authenticated

