// 練習 2：Edge Function checkout（Deno）。POST { items: [{ product_id, quantity }] } → 200 { order_id, total, charge_id }
// 環境變數（Deno.env.get）：
//   SUPABASE_URL                Supabase 的網址
//   SUPABASE_PUBLISHABLE_KEYS   JSON：{ "default": "sb_publishable_…" }
//   SUPABASE_SECRET_KEYS        JSON：{ "default": "sb_secret_…" }
//   PAYMENT_API_URL、PAYMENT_API_KEY   金流的網址與金鑰（secrets，本機寫在 supabase/functions/.env）
//   DB_SCHEMA                   判分用：這一題的表在專屬 schema，對 /rest/v1 的請求要加 Content-Profile、Accept-Profile 這兩個 header
// 金流 API：POST <PAYMENT_API_URL>/charges，header Authorization: Bearer <PAYMENT_API_KEY>，body { order_id, amount } → { id }
Deno.serve(async (req) => {
  // 1. 用呼叫者的 Authorization 呼叫 /rest/v1/rpc/place_order（練習 1 的函式），失敗就把狀態碼原樣回給呼叫者，不扣款
  // 2. 用同一個身分讀這張訂單的 total（/rest/v1/orders?id=eq.<id>&select=total）
  // 3. 向金流扣款；失敗回 502
  // 4. 回傳 { order_id, total, charge_id }
  return Response.json({ error: '還沒寫' }, { status: 500 })
})
