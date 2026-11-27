import test from 'node:test'
import assert from 'node:assert/strict'
import { request, type Server } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Item = { id: number, name: string, price: number }
const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
// 每次用不同的菜單：名稱加上隨機的字
const suffix = pick(['特調', '大杯', '燕麥', '冰'])
const menu: Item[] = names.map((n, i) => ({ id: i + 1, name: n + suffix, price: 100 }))

async function start() {
  const mod: { createApp?: unknown } = await import('./create-order.ts')
  assert.equal(typeof mod.createApp, 'function', 'create-order.ts 要 export function createApp(menu)')
  const server = (mod.createApp as (m: Item[]) => Server)(menu)
  return (await listen(server)).port
}

type Reply = { status: number, json: any, sent: number }

// 用 node:http 送 POST /orders：body 分成好幾段，每段之間停一下；收到回應就不再送
function post(port: number, parts: Buffer[], type: string | null = 'application/json', gapMs = 5): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (type) headers['content-type'] = type
    const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/orders', headers })
    let replied = false, sent = 0
    const timer = setTimeout(() => { req.destroy(); reject(new Error('伺服器 5 秒內沒有回應：是不是處理函式丟出錯誤、沒有回應就結束了？')) }, 5000)
    req.on('response', res => {
      replied = true
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        clearTimeout(timer)
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown = null
        try { json = JSON.parse(text) } catch {}
        resolve({ status: res.statusCode ?? 0, json, sent })
      })
    })
    req.on('error', err => { if (!replied) { clearTimeout(timer); reject(new Error(`連線出錯：${err.message}（伺服器是不是倒了？）`)) } })
    ;(async () => {
      for (const part of parts) {
        if (replied || req.destroyed) return
        req.write(part)
        sent += part.length
        await sleep(gapMs)
      }
      if (!replied && !req.destroyed) req.end()
    })()
  })
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v))

test('body 分三段送、切在中文字中間，也要正確解析，回 201', opts, async () => {
  const port = await start()
  const drink = pick(menu).name
  const qty = 1 + Math.floor(Math.random() * 20)
  const buf = json({ drink, qty })
  const cut = buf.indexOf(Buffer.from(drink)) + 1   // 中文字的第 2 個位元組
  const r = await post(port, [buf.subarray(0, cut), buf.subarray(cut, cut + 3), buf.subarray(cut + 3)])
  assert.equal(r.status, 201, `合法的訂單要回 201，收到 ${r.status}：${JSON.stringify(r.json)}。chunk 可能把一個中文字切成兩半，要先把所有 Buffer 接起來再解碼`)
  assert.deepEqual(r.json, { order: { drink, qty } }, '201 的 body 是 { order: { drink, qty } }')
})

test('Content-Type 不是 application/json 回 415', opts, async () => {
  const port = await start()
  const body = json({ drink: menu[0].name, qty: 1 })
  const ok = await post(port, [body], 'application/json; charset=utf-8')
  assert.equal(ok.status, 201, 'application/json; charset=utf-8 也是 JSON，要接受')
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', null]) {
    const r = await post(port, [body], type)
    assert.equal(r.status, 415, `Content-Type 是 ${type ?? '（沒有）'} 時要回 415`)
    assert.equal(r.json?.error?.code, 'UNSUPPORTED_MEDIA_TYPE', '415 的錯誤 code 要是 UNSUPPORTED_MEDIA_TYPE')
  }
})

test('JSON 壞掉回 400 INVALID_JSON，伺服器繼續運作', opts, async () => {
  const port = await start()
  const r = await post(port, [Buffer.from('{"drink": "拿鐵", qty: ')])
  assert.equal(r.status, 400, '壞掉的 JSON 要回 400')
  assert.equal(r.json?.error?.code, 'INVALID_JSON', '錯誤 code 要是 INVALID_JSON')
  const after = await post(port, [json({ drink: menu[1].name, qty: 2 })])
  assert.equal(after.status, 201, '之後的請求要照常處理')
})

test('欄位驗證：一次列出所有錯誤的欄位', opts, async () => {
  const port = await start()
  const cases: [unknown, string[]][] = [
    [{ drink: '珍珠奶茶', qty: 0 }, ['drink', 'qty']],
    [{ drink: names[0], qty: 2 }, ['drink']],              // 菜單上的是加了後綴的名稱
    [{ drink: menu[2].name, qty: 2.5 }, ['qty']],
    [{ drink: menu[2].name, qty: 21 }, ['qty']],
    [{ drink: menu[2].name, qty: '3' }, ['qty']],
    [{}, ['drink', 'qty']],
    [[1, 2], ['drink', 'qty']],
    [null, ['drink', 'qty']],                              // JSON.parse('null') 是 null，不是物件
  ]
  for (const [body, fields] of cases) {
    const r = await post(port, [json(body)])
    assert.equal(r.status, 400, `${JSON.stringify(body)} 要回 400`)
    assert.equal(r.json?.error?.code, 'VALIDATION', `${JSON.stringify(body)} 的錯誤 code 要是 VALIDATION`)
    const got = Array.isArray(r.json?.error?.details) ? r.json.error.details.map((d: any) => d?.field).sort() : null
    assert.deepEqual(got, fields, `${JSON.stringify(body)} 的 details 要列出這些欄位：${fields.join('、')}（每個是 { field, message }，不要只回第一個錯誤）`)
  }
  for (const qty of [1, 20]) {
    const r = await post(port, [json({ drink: menu[3].name, qty })])
    assert.equal(r.status, 201, `qty ${qty} 在範圍內，要回 201`)
  }
})

test('剛好 10KB 可以，多 1 位元組回 413', opts, async () => {
  const port = await start()
  const base = json({ drink: menu[4].name, qty: 3 })
  const pad = (n: number) => Buffer.concat([base.subarray(0, -1), Buffer.alloc(n - base.length, ' '), Buffer.from('}')])
  const exact = await post(port, [pad(10 * 1024)])
  assert.equal(exact.status, 201, '剛好 10240 位元組的 body 不能算太大')
  const over = await post(port, [pad(10 * 1024 + 1)])
  assert.equal(over.status, 413, '10241 位元組要回 413')
  assert.equal(over.json?.error?.code, 'PAYLOAD_TOO_LARGE', '413 的錯誤 code 要是 PAYLOAD_TOO_LARGE')
  // 上限是位元組數：3500 個中文字只有約 3500 個字元，卻有約 10.5KB
  const zh = json({ drink: menu[4].name, qty: 3, note: '拿'.repeat(3500) })
  const big = await post(port, [zh])
  assert.equal(big.status, 413, `${zh.length} 位元組（但只有約 3500 個字元）的 body 要回 413：上限算的是位元組數，不是字元數，要累計 Buffer 的 length`)
})

test('送 1MB：還沒送完就要收到 413，之後伺服器照常運作', opts, async () => {
  const port = await start()
  const parts = Array.from({ length: 64 }, () => Buffer.alloc(16 * 1024, 'a'))   // 沒有 Content-Length，一段一段送
  const r = await post(port, parts, 'application/json', 10)
  assert.equal(r.status, 413, `1MB 的 body 要回 413，收到 ${r.status}`)
  assert.ok(r.sent < 1024 * 1024, `伺服器等整個 1MB 都收完才回應（已送出 ${r.sent} 位元組）：累計的長度一超過上限就要停止讀取並回 413`)
  const after = await post(port, [json({ drink: menu[5].name, qty: 1 })])
  assert.equal(after.status, 201, '之後的請求要照常處理')
})
