// 本機的假金流商 CafePay：npm run dev 會在 3190 port 一起啟動它（也可以單獨執行 node cafepay/server.mjs）
// 行為照一般金流商的 API：
//   POST /v1/payments          扣款。標頭 Idempotency-Key 相同的請求只扣一次，之後回傳第一次的結果
//                              body { orderId, amount, cardToken }；cardToken 是 tok_declined 時卡片被拒絕（402）
//   GET  /v1/payments?orderId= 查詢某張訂單的付款（補單用）；沒有就 404
//   扣款之後過 1 秒，把結果用 webhook 通知 API（POST /webhooks/cafepay，帶 CafePay-Signature 簽章）
// 練習用的故障開關：POST /_faults，body 例如 {"timeoutAfterCharge":1}，數字是「接下來幾次」
//   timeoutAfterCharge  扣款成功，但不回應（呼叫的一方會等到逾時）
//   dropWebhooks        不送 webhook（漏通知）
//   duplicateWebhooks   同一個 webhook 同時送兩次（重複通知）
import { createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

// 簽章格式：CafePay-Signature: t=<Unix 秒數>,v1=<HMAC-SHA256(`${t}.` + 原始 body) 的 hex>
export function signWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')}`
}

export async function startCafePay({ port = 0, webhookUrl = null, webhookSecret = 'whsec_dev_cafe', webhookDelayMs = 1000, log = false } = {}) {
  const byKey = new Map()     // Idempotency-Key → { fingerprint, status, body }
  const byOrder = new Map()   // orderId → 付款
  const timers = new Set()
  const fake = {
    url: '',
    charges: [],    // 真的扣了款的付款
    requests: [],   // 收到的每一個扣款請求 { key, body }（重試也算）
    lookups: [],    // 收到的每一個查詢的 orderId
    faults: { timeoutAfterCharge: 0, dropWebhooks: 0, duplicateWebhooks: 0 },
    close: () => new Promise(resolve => {
      for (const t of timers) clearTimeout(t)
      server.closeAllConnections()   // 包括故意不回應、還掛著的請求
      server.close(() => resolve(undefined))
    }),
  }
  const say = (...a) => log && console.log('[CafePay]', ...a)
  const reply = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))

  function notify(payment) {
    if (!webhookUrl) return
    if (fake.faults.dropWebhooks > 0) {
      fake.faults.dropWebhooks--
      return say(`故障：不送 ${payment.id} 的 webhook`)
    }
    const times = fake.faults.duplicateWebhooks > 0 ? (fake.faults.duplicateWebhooks--, 2) : 1
    const event = {
      id: `evt_${randomBytes(6).toString('hex')}`,
      type: payment.status === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
      created: Math.floor(Date.now() / 1000),
      data: { paymentId: payment.id, orderId: payment.orderId, amount: payment.amount },
    }
    const timer = setTimeout(async () => {
      timers.delete(timer)
      const raw = JSON.stringify(event)
      const send = () => fetch(webhookUrl, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'CafePay-Signature': signWebhook(raw, webhookSecret) } })
        .then(r => say(`webhook ${event.id} ${event.type} 訂單 ${payment.orderId} → ${r.status}`), e => say(`webhook ${event.id} 送不出去：${e.message}`))
      await Promise.all(Array.from({ length: times }, send))
    }, webhookDelayMs)
    timers.add(timer)
  }

  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const text = Buffer.concat(chunks).toString('utf8')
    const url = new URL(req.url, 'http://cafepay')

    if (req.method === 'POST' && url.pathname === '/v1/payments') {
      const key = req.headers['idempotency-key']
      let body
      try { body = JSON.parse(text) } catch { return reply(res, 400, { error: 'invalid_json' }) }
      if (!key) return reply(res, 400, { error: 'idempotency_key_required' })
      fake.requests.push({ key, body })
      const fingerprint = JSON.stringify([body.orderId, body.amount])
      const saved = byKey.get(key)
      if (saved) {
        // 同一把 key 用在不同的付款上：一定是呼叫的一方寫錯了
        if (saved.fingerprint !== fingerprint) return reply(res, 422, { error: 'idempotency_key_reused', message: `Idempotency-Key ${key} 已經用在另一筆付款` })
        say(`重試 ${key}：回傳第一次的結果 ${saved.body.id}（沒有再扣款）`)
        return reply(res, saved.status, saved.body)
      }
      const declined = body.cardToken === 'tok_declined'
      const payment = { id: `pay_${randomBytes(6).toString('hex')}`, orderId: body.orderId, amount: body.amount, status: declined ? 'failed' : 'succeeded' }
      if (declined) payment.error = 'card_declined'
      const status = declined ? 402 : 201
      byKey.set(key, { fingerprint, status, body: payment })
      byOrder.set(String(body.orderId), payment)
      if (!declined) fake.charges.push(payment)
      say(`${declined ? '卡片被拒絕' : '扣款'} ${payment.id} 訂單 ${body.orderId} ${body.amount} 元（key ${key}）`)
      notify(payment)
      if (fake.faults.timeoutAfterCharge > 0) {
        fake.faults.timeoutAfterCharge--
        return say(`故障：${payment.id} 已扣款，但不回應`)   // 不呼叫 res.end()：對方只能等到逾時
      }
      return reply(res, status, payment)
    }

    if (req.method === 'GET' && url.pathname === '/v1/payments') {
      const orderId = url.searchParams.get('orderId') ?? ''
      fake.lookups.push(Number(orderId))
      const payment = byOrder.get(orderId)
      say(`查詢訂單 ${orderId}：${payment ? payment.status : '查無付款'}`)
      return payment ? reply(res, 200, payment) : reply(res, 404, { error: 'not_found' })
    }

    if (req.method === 'POST' && url.pathname === '/_faults') {
      try { Object.assign(fake.faults, JSON.parse(text || '{}')) } catch { return reply(res, 400, { error: 'invalid_json' }) }
      say('故障開關', fake.faults)
      return reply(res, 200, fake.faults)
    }

    reply(res, 404, { error: 'not_found' })
  })

  await new Promise(resolve => server.listen(port, 'localhost', () => resolve(undefined)))
  fake.url = `http://localhost:${server.address().port}`
  return fake
}

if (import.meta.main) {
  const fake = await startCafePay({
    port: Number(process.env.CAFEPAY_PORT ?? 3190),
    webhookUrl: process.env.CAFEPAY_WEBHOOK_URL ?? 'http://localhost:3100/webhooks/cafepay',
    webhookSecret: process.env.CAFEPAY_WEBHOOK_SECRET ?? 'whsec_dev_cafe',
    log: true,
  })
  console.log(`[CafePay] 假金流商在 ${fake.url}`)
  process.on('SIGINT', () => fake.close().then(() => process.exit(0)))
  process.on('SIGTERM', () => fake.close().then(() => process.exit(0)))
}
