import test from 'node:test'
import assert from 'node:assert/strict'
import { request, type Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Item = { id: number, name: string, nameEn: string, price: number }
const rand = (n: number) => Math.floor(Math.random() * n)

function makeMenu(): Item[] {
  const base = 10 + rand(80)
  return [['拿鐵', 'Latte'], ['可頌', 'Croissant'], ['伯爵紅茶', 'Earl Grey Tea']].map(([name, nameEn], i) => ({ id: base + i, name, nameEn, price: 70 + rand(50) }))
}

async function start(menu: Item[]) {
  const mod: { createApp?: unknown } = await import('./menu-update.ts')
  assert.equal(typeof mod.createApp, 'function', 'menu-update.ts 要 export function createApp(menu)')
  return (await listen((mod.createApp as (m: Item[]) => Server)(menu))).port
}

type Reply = { status: number, json: any, type: string, etag: string | undefined }

// 用 node:http 送請求。PUT 先只送標頭，呼叫 finish() 才送 body：用來模擬兩位店長幾乎同時送出
function send(port: number, method: string, path: string, headers: Record<string, string> = {}) {
  const req = request({ host: '127.0.0.1', port, method, path, headers })
  const reply = new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`${method} ${path} 3 秒內沒有回應`)) }, 3000)
    req.on('response', res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        clearTimeout(timer)
        let json: unknown = null
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
        resolve({ status: res.statusCode ?? 0, json, type: String(res.headers['content-type'] ?? ''), etag: res.headers.etag })
      })
    })
    req.on('error', err => { clearTimeout(timer); reject(new Error(`${method} ${path} 連線出錯：${err.message}`)) })
  })
  reply.catch(() => {})
  return { finish(body?: unknown) { req.end(body === undefined ? undefined : JSON.stringify(body)); return reply }, flush() { req.flushHeaders() } }
}

const get = (port: number, id: number) => send(port, 'GET', `/menu/${id}`).finish()
function put(port: number, id: number, body: unknown, ifMatch?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (ifMatch !== undefined) headers['if-match'] = ifMatch
  return send(port, 'PUT', `/menu/${id}`, headers)
}

function isProblem(r: Reply, status: number, label: string) {
  assert.ok(r.type.startsWith('application/problem+json'), `${label} 要用 sendProblem 回 application/problem+json（收到 ${r.type}）`)
  assert.equal(r.json?.status, status, `${label} 的 problem details 裡 status 要是 ${status}`)
}

test('GET /menu/:id 回品項和強 ETag', opts, async () => {
  const menu = makeMenu()
  const port = await start(menu)
  const r = await get(port, menu[1].id)
  assert.equal(r.status, 200)
  assert.deepEqual(r.json, menu[1])
  assert.match(r.etag ?? '', /^"[\x21\x23-\x7e]+"$/, 'ETag 要用雙引號包起來（先完成練習 1 的 etagOf）')
  const again = await get(port, menu[1].id)
  assert.equal(again.etag, r.etag, '內容沒變，ETag 要一樣（先完成練習 1 的 etagOf）')
})

test('PUT 沒帶 If-Match：回 428，品項不變', opts, async () => {
  const menu = makeMenu()
  const port = await start(menu)
  const before = structuredClone(menu[0])
  const r = await put(port, menu[0].id, { ...before, price: before.price + 10 }).finish({ ...before, price: before.price + 10 })
  assert.equal(r.status, 428, '沒帶 If-Match 的修改要回 428 Precondition Required：要求客戶端先拿 ETag')
  isProblem(r, 428, '428')
  assert.deepEqual(menu[0], before, '回 428 時不能修改品項')
})

test('兩位店長拿著同一個 ETag 修改：先送的成功，後送的 412', opts, async () => {
  const menu = makeMenu()
  const port = await start(menu)
  const item = menu[2]
  const { etag } = await get(port, item.id)
  assert.ok(etag, 'GET 要帶 ETag')
  const a = { name: item.name, nameEn: item.nameEn, price: item.price + 5 + rand(10) }
  const b = { name: item.name + '（大杯）', nameEn: item.nameEn, price: item.price }

  const ra = await put(port, item.id, a, etag).finish(a)
  assert.equal(ra.status, 200, `If-Match 和目前的 ETag 相同，要回 200（收到 ${ra.status}）`)
  assert.deepEqual(ra.json, { id: item.id, ...a }, '200 的 body 是修改後的品項')
  const now = await get(port, item.id)
  assert.ok(ra.etag, '200 要帶修改後的新 ETag，客戶端下次修改才不用再 GET 一次')
  assert.equal(ra.etag, now.etag, '200 帶的 ETag 要和之後 GET 拿到的一樣')
  assert.notEqual(ra.etag, etag, '內容變了，ETag 要跟著變')

  const rb = await put(port, item.id, b, etag).finish(b)
  assert.equal(rb.status, 412, `B 拿的是舊的 ETag，要回 412 Precondition Failed（收到 ${rb.status}）。不是 409：412 專指請求帶的前提條件不成立`)
  isProblem(rb, 412, '412')
  assert.deepEqual(menu.find(i => i.id === item.id), { id: item.id, ...a }, '回 412 時不能修改：最後的內容要是 A 的修改')
})

test('同時送出：比對和修改之間不能有空隙', opts, async () => {
  const menu = makeMenu()
  const port = await start(menu)
  const item = menu[1]
  const { etag } = await get(port, item.id)
  assert.ok(etag, 'GET 要帶 ETag')
  const a = { name: item.name, nameEn: item.nameEn, price: item.price + 1 }
  const b = { name: item.name, nameEn: item.nameEn, price: item.price + 2 }
  // 兩個請求的標頭都先到伺服器，body 晚一點才送
  const pa = put(port, item.id, a, etag), pb = put(port, item.id, b, etag)
  pa.flush(); pb.flush()
  await new Promise(r => setTimeout(r, 100))
  const ra = await pa.finish(a)
  const rb = await pb.finish(b)
  assert.deepEqual([ra.status, rb.status], [200, 412], `兩個請求拿同一個 ETag，只能有一個成功（收到 ${ra.status}、${rb.status}）。比對 If-Match 要在讀完 body 之後、修改之前，中間不能有 await`)
  assert.equal(menu.find(i => i.id === item.id)?.price, a.price)
})

test('If-Match 的寫法：清單、*、弱 ETag 不算', opts, async () => {
  const menu = makeMenu()
  const port = await start(menu)
  const item = menu[0]
  const body = (price: number) => ({ name: item.name, nameEn: item.nameEn, price })

  const { etag } = await get(port, item.id)
  assert.ok(etag, 'GET 要帶 ETag')
  const weak = await put(port, item.id, body(201), `W/${etag}`).finish(body(201))
  assert.equal(weak.status, 412, 'If-Match 用強比較：W/ 開頭的弱 ETag 永遠不算相符，要回 412')
  const wrong = await put(port, item.id, body(202), '"nope"').finish(body(202))
  assert.equal(wrong.status, 412, 'If-Match: "nope" 不相符，要回 412')

  const list = await put(port, item.id, body(203), `"old", ${etag}`).finish(body(203))
  assert.equal(list.status, 200, 'If-Match 可以是用逗號分開的清單，其中一個相符就成功')
  const star = await put(port, item.id, body(204), '*').finish(body(204))
  assert.equal(star.status, 200, 'If-Match: * 代表「只要這個品項存在」，要成功')
  assert.equal(item.price, 204)
})
