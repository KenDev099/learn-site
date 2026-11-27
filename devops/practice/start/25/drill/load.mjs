// 送流量給 ld-25-api：node drill/load.mjs <起始編號> <數量>（drill.sh 會呼叫，不用改）
// 每 4 個請求有 1 個是 POST /orders，其他是 GET /products；請求 ID 固定是 drill-0001 這種格式，方便在 log 裡找
const [from, n] = process.argv.slice(2).map(Number)
let failed = 0
for (let i = from; i < from + n; i++) {
  const headers = { 'x-request-id': `drill-${String(i).padStart(4, '0')}`, 'content-type': 'application/json' }
  const order = i % 4 === 0
  const res = await fetch(`http://localhost:18250${order ? '/orders' : '/products'}`, order
    ? { method: 'POST', headers, body: JSON.stringify({ product_id: 1 + i % 6, quantity: 1 + i % 3 }) }
    : { headers })
  await res.arrayBuffer()
  if (res.status >= 500) failed++
}
console.log(`送出 ${n} 個請求，${failed} 個 5xx（${(failed / n * 100).toFixed(1)}%）`)
