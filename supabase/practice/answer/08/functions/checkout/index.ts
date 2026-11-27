// 練習 2：Edge Function checkout（Deno）。POST { items: [{ product_id, quantity }] } → 200 { order_id, total, charge_id }
// 環境變數（Deno.env.get）：
//   SUPABASE_URL                Supabase 的網址
//   SUPABASE_PUBLISHABLE_KEYS   JSON：{ "default": "sb_publishable_…" }
//   SUPABASE_SECRET_KEYS        JSON：{ "default": "sb_secret_…" }
//   PAYMENT_API_URL、PAYMENT_API_KEY   金流的網址與金鑰（secrets，本機寫在 supabase/functions/.env）
//   DB_SCHEMA                   判分用：這一題的表在專屬 schema，對 /rest/v1 的請求要加 Content-Profile、Accept-Profile 這兩個 header
// 金流 API：POST <PAYMENT_API_URL>/charges，header Authorization: Bearer <PAYMENT_API_KEY>，body { order_id, amount } → { id }
Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!).default
  const schema = Deno.env.get('DB_SCHEMA')!
  // 用呼叫者自己的 token：PostgREST 以這位顧客的身分執行，RLS 與 place_order 裡的 auth.uid() 都照常運作
  const asCaller = {
    apikey: publishable,
    Authorization: req.headers.get('Authorization') ?? '',
    'Content-Type': 'application/json',
    'Content-Profile': schema,
    'Accept-Profile': schema,
  }
  const { items } = await req.json()

  const placed = await fetch(`${url}/rest/v1/rpc/place_order`, { method: 'POST', headers: asCaller, body: JSON.stringify({ items }) })
  if (!placed.ok) return new Response(await placed.text(), { status: placed.status, headers: { 'Content-Type': 'application/json' } })
  const orderId: number = await placed.json()

  const read = await fetch(`${url}/rest/v1/orders?id=eq.${orderId}&select=total`, { headers: asCaller })
  const [{ total }] = await read.json()

  // 金流的金鑰只存在伺服器端的環境變數，前端看不到
  const charge = await fetch(`${Deno.env.get('PAYMENT_API_URL')}/charges`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('PAYMENT_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, amount: total }),
  })
  if (!charge.ok) return Response.json({ error: '扣款失敗', order_id: orderId }, { status: 502 })
  const { id } = await charge.json()
  return Response.json({ order_id: orderId, total, charge_id: id })
})
