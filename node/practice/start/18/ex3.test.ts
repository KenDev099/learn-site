import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const secret = () => 'secret-' + randomBytes(4).toString('hex')

type Order = { id: number, drink: string, qty: number }
type Fields = Record<string, unknown>

// 假資料庫：fail 給了就丟出它，沒給就成功
async function start(fail?: () => unknown) {
  const mod: { createApp?: unknown } = await import('./order-flow.ts')
  assert.equal(typeof mod.createApp, 'function', 'order-flow.ts 要 export createApp({ db, logger })')
  const logs: Fields[] = []
  const inserted: unknown[] = []
  const id = 1000 + Math.floor(Math.random() * 9000)
  const db = {
    async insertOrder(order: { drink: string, qty: number }): Promise<Order> {
      inserted.push(order)
      await new Promise(r => setTimeout(r, 5))
      if (fail) throw fail()
      return { id, ...order }
    },
  }
  const logger = { error: (fields: Fields) => { logs.push(fields) } }
  const { url } = await listen((mod.createApp as (d: { db: typeof db, logger: typeof logger }) => Server)({ db, logger }))
  const post = async (body: unknown) => {
    const res = await fetch(url + '/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json().catch(() => null) as Fields | null }
  }
  return { post, logs, inserted, id }
}

const dbError = (code: string, message: string) => Object.assign(new Error(message), { code })

test('正常建立：201、回訂單，沒有任何 error log', opts, async () => {
  const s = await start()
  const qty = 1 + Math.floor(Math.random() * 20)
  const r = await s.post({ drink: '拿鐵', qty })
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { id: s.id, drink: '拿鐵', qty })
  assert.equal(s.logs.length, 0, '成功的請求不能有 error log')
})

test('驗證失敗：400，可預期的錯誤不記 error', opts, async () => {
  const s = await start()
  const r = await s.post({ drink: '', qty: 0 })
  assert.equal(r.status, 400)
  assert.equal(s.inserted.length, 0, '驗證失敗不能寫進資料庫')
  assert.equal(s.logs.length, 0, '400 是客戶端的問題，不是伺服器的錯誤，不要記成 error log')
})

test('23505（unique 衝突）→ 409 ConflictError，不記 error log', opts, async () => {
  const s = await start(() => dbError('23505', `duplicate key value violates unique constraint "${secret()}"`))
  const r = await s.post({ drink: '美式咖啡', qty: 1 })
  assert.equal(r.status, 409, '23505 要由 repository 包成 ConflictError，回 409。service 不能把錯誤吞掉')
  assert.equal(r.body?.type, 'https://coffee.example/problems/conflict')
  assert.equal(JSON.stringify(r.body).includes('secret-'), false, '回應不能有資料庫的原始訊息')
  assert.equal(s.logs.length, 0, `409 是可預期的錯誤，不要記成 error log（收到 ${s.logs.length} 行：每一層都 log 了嗎？）`)
})

test('資料庫訊息換成中文（lc_messages）時照樣判斷：要看 code，不能看訊息', opts, async () => {
  const s1 = await start(() => dbError('23505', `重複的索引鍵值違反唯一限制 "${secret()}"`))
  assert.equal((await s1.post({ drink: '美式咖啡', qty: 1 })).status, 409, '訊息會隨資料庫的語言設定改變；23505 要看 err.code 判斷，不能比對訊息文字')
  const s2 = await start(() => dbError('57014', `取消陳述式，因為陳述式逾時 ${secret()}`))
  assert.equal((await s2.post({ drink: '拿鐵', qty: 1 })).status, 503, '57014 要看 err.code 判斷，不能比對訊息文字')
})

function checkLog(s: { logs: Fields[] }, body: Fields | null, name: string, code: string) {
  assert.equal(s.logs.length, 1, `同一個錯誤要剛好記 1 行 error log，收到 ${s.logs.length} 行。只有 handler（錯誤邊界）記錄，repository 和 service 不要 log`)
  const log = s.logs[0]
  assert.equal(typeof body?.errorId, 'string', '5xx 回應要有 errorId（用練習 1 的 toProblem）')
  assert.equal(log.errorId, body?.errorId, '回應的 errorId 要和 log 的 errorId 是同一個值：只產生一次，兩邊都用它')
  assert.equal(log.name, name, `log 的 name 要是最外層錯誤的名稱 ${name}`)
  assert.equal(typeof log.msg, 'string', 'log 要有 msg（一句說明，例如 request failed）')
  assert.ok(typeof log.message === 'string' && log.message !== '', 'log 要有 message：最外層錯誤的 message')
  assert.ok(Array.isArray(log.codes), 'log 要有 codes：沿著 cause 一路往下，收集每一層的 code')
  assert.ok((log.codes as unknown[]).includes(code), `log 的 codes 要包含原始的資料庫 code ${code}（收到 ${JSON.stringify(log.codes)}）。包裝錯誤時要放 cause`)
  assert.equal(JSON.stringify(body).includes('secret-'), false, '回應不能有原始訊息')
}

test('57014（查詢逾時）→ 503 UpstreamError，記 1 行，cause 鏈有 57014', opts, async () => {
  const s = await start(() => dbError('57014', `canceling statement due to statement timeout ${secret()}`))
  const r = await s.post({ drink: '卡布奇諾', qty: 2 })
  assert.equal(r.status, 503, '57014 要包成 UpstreamError，回 503')
  checkLog(s, r.body, 'UpstreamError', '57014')
  assert.ok((s.logs[0].codes as unknown[]).includes('UPSTREAM_UNAVAILABLE'), 'codes 第一層是 UpstreamError 的 code UPSTREAM_UNAVAILABLE')
})

test('不認得的資料庫錯誤 → 500，原樣往上傳，記 1 行', opts, async () => {
  const code = 'XX' + randomBytes(2).toString('hex').toUpperCase()
  const s = await start(() => dbError(code, `internal error ${secret()}`))
  const r = await s.post({ drink: '伯爵紅茶', qty: 3 })
  assert.equal(r.status, 500, '不認得的錯誤要回 500，不能被吞掉變成 201')
  checkLog(s, r.body, 'Error', code)
})

test('程式的 bug（TypeError）→ 500，記 1 行；每個請求的 errorId 都不同', opts, async () => {
  const s = await start(() => new TypeError(`Cannot read properties of undefined (reading '${secret()}')`))
  const r1 = await s.post({ drink: '可頌', qty: 1 })
  assert.equal(r1.status, 500)
  assert.equal(s.logs.length, 1, `收到 ${s.logs.length} 行 error log，要剛好 1 行`)
  assert.equal(s.logs[0].name, 'TypeError')
  assert.ok(String(s.logs[0].message).includes('Cannot read properties'), 'log 的 message 要是原始的錯誤訊息：細節只寫進 log，不回給客戶端')
  assert.equal(s.logs[0].errorId, r1.body?.errorId, '回應和 log 的 errorId 要相同')
  const r2 = await s.post({ drink: '可頌', qty: 1 })
  assert.notEqual(r2.body?.errorId, r1.body?.errorId, '每個請求的 errorId 要不同')
})
