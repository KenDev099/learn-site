import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { usePg } from '../../helpers/pg.ts'
import { useEs } from '../../helpers/es.ts'
import { S3_CONFIG, useS3 } from '../../helpers/s3.ts'
import { placeOrder } from './fixtures.ts'
import { createTables, MENU, MENU_MAPPINGS, type Deps, type MenuDoc } from './schema.ts'
import { runWorker } from './worker.ts'

process.env.TZ = 'Asia/Taipei'   // 跟台灣的伺服器一樣：本地時間比 UTC 快 8 小時，收據的年月要用 UTC
const pool = usePg(15)
const es = useEs(15, { requestTimeout: 30_000 })   // 機器忙時建索引可能超過 10 秒
const { s3, bucket } = useS3(15, 'receipts')
const ALIAS = 't15-menu'
const OCT = new Date('2026-10-15T03:00:00Z')
const SEP_END = new Date('2026-09-30T20:00:00Z')   // UTC 是 9 月 30 日，台灣時間已經是 10 月 1 日
let deps: Deps

async function doc(id: number) {
  const r = await es.get<MenuDoc>({ index: ALIAS, id: String(id) })
  return { sold: r._source!.sold, version: r._version }
}
const keys = async () => ((await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'receipts/' }))).Contents ?? []).map(o => o.Key!).sort()
const event = async (orderId: number) => (await pool.query('SELECT processed_at IS NOT NULL AS done, attempts, last_error FROM outbox WHERE aggregate_id = $1', [orderId])).rows[0]
const receiptKey = async (orderId: number) => (await pool.query('SELECT receipt_key FROM orders WHERE id = $1', [orderId])).rows[0].receipt_key

describe('練習 3：outbox worker', { timeout: 240_000 }, () => {
  before(async () => {
    await createTables(pool)
    await es.indices.create({ index: 't15-menu-v1', mappings: MENU_MAPPINGS, aliases: { [ALIAS]: {} } })
    await es.bulk({ refresh: true, operations: MENU.flatMap(({ stock, ...p }) => [
      { index: { _index: 't15-menu-v1', _id: String(p.id), version: 1, version_type: 'external' as const } }, { ...p, available: true, sold: 0 },
    ]) })
    deps = { pool, redis: undefined as never, es, index: ALIAS, s3, bucket }   // worker 用不到 Redis
  })

  let first = 0
  test('處理 order.paid：ES 熱銷度與版本、收據物件、receipt_key、事件完成', async () => {
    first = await placeOrder(pool, 21, { 11: 2, 16: 1 }, OCT)
    const n = await runWorker(deps, { once: true })
    assert.equal(n, 1, `runWorker({ once: true }) 要回傳完成的事件數 1，實際 ${n}`)
    assert.deepEqual(await doc(11), { sold: 2, version: 2 }, '美式咖啡在 ES 的 sold 要是 2、_version 要等於 products.version（2）：用 es.index 帶 version 與 version_type: external')
    assert.deepEqual(await doc(16), { sold: 1, version: 2 }, '起司蛋糕在 ES 的 sold 要是 1、_version 2')
    assert.deepEqual(await doc(12), { sold: 0, version: 1 }, '這筆訂單沒有拿鐵，拿鐵的文件不該被改')
    const key = `receipts/2026/10/${first}.txt`
    assert.deepEqual(await keys(), [key], `bucket 裡要剛好有一個收據 ${key}（年月取 created_at 的 UTC，檔名是訂單 id）`)
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const body = await obj.Body!.transformToString()
    assert.match(obj.ContentType ?? '', /^text\/plain/, `收據的 ContentType 要是 text/plain; charset=utf-8，實際 ${obj.ContentType}`)
    assert.ok(body.includes(`訂單 #${first}`) && body.includes('美式咖啡 x2') && body.includes('合計 280 元'), `收據內容要用 renderReceipt 產生（品項要有名稱、數量、單價），實際：\n${body}`)
    assert.equal(await receiptKey(first), key, 'orders.receipt_key 要寫回收據的 key')
    assert.equal((await event(first)).done, true, '兩件事都完成後，事件要設 processed_at')
    assert.equal(await runWorker(deps, { once: true }), 0, '沒有待處理事件時回傳 0')
  })

  test('同一個事件被處理兩次（而且中間有新訂單）：熱銷度不重複累加、不往回退，收據不多一份', async () => {
    const second = await placeOrder(pool, 22, { 11: 1 }, OCT)
    assert.equal(await runWorker(deps, { once: true }), 1, '第二筆訂單要處理完成')
    assert.deepEqual(await doc(11), { sold: 3, version: 3 }, '第二筆訂單後，美式咖啡 sold 3、_version 3')
    await pool.query('UPDATE outbox SET processed_at = NULL WHERE aggregate_id = $1', [first])   // 模擬：worker 做完卻在 COMMIT 前當機，事件又被拿出來
    assert.equal(await runWorker(deps, { once: true }), 1, '重新處理的事件也要完成：ES 回 409 代表已經有相同或更新的版本，算成功')
    const d = await doc(11)
    assert.equal(d.sold, 3, `重新處理第一筆訂單後，美式咖啡的 sold 變成 ${d.sold}：不要用「+數量」累加，要寫 PostgreSQL 裡目前的 sold，並帶 products.version 當外部版本號`)
    assert.equal(d.version, 3, '_version 要停在 3')
    assert.deepEqual(await keys(), [`receipts/2026/10/${first}.txt`, `receipts/2026/10/${second}.txt`], '重做不能多出第二份收據：key 只由訂單決定，不含隨機值或時間戳')
  })

  test('S3 失敗：事件不標記完成，attempts 加 1、記下錯誤；S3 恢復後補上', async () => {
    const id = await placeOrder(pool, 23, { 12: 1 }, SEP_END)
    const down = new S3Client({ ...S3_CONFIG, endpoint: 'http://127.0.0.1:9', maxAttempts: 1 })   // 沒有服務的 port：模擬 Garage 當機
    try {
      const n = await runWorker({ ...deps, s3: down }, { once: true })
      assert.equal(n, 0, `S3 失敗時這個事件沒有完成，回傳值要是 0，實際 ${n}`)
    } finally {
      down.destroy()
    }
    const e = await event(id)
    assert.equal(e.done, false, 'S3 上傳失敗，事件卻被標記完成：這張收據永遠不會補上。失敗時不要設 processed_at')
    assert.equal(e.attempts, 1, '失敗時 attempts 要加 1')
    assert.ok(e.last_error, 'last_error 要記下錯誤訊息，值班的人才知道為什麼卡住')
    assert.equal(await receiptKey(id), null, '上傳失敗時不能寫 receipt_key')
    assert.equal(await runWorker(deps, { once: true }), 1, 'S3 恢復後，下一輪要把這個事件處理完')
    assert.equal(await receiptKey(id), `receipts/2026/09/${id}.txt`, `補上之後 receipt_key 要寫好。這筆訂單的 created_at 是 2026-09-30T20:00:00Z：年月取 UTC（toISOString），月份補成兩位數 09`)
  })

  test('兩個 worker 並發處理 12 個事件：每張收據只上傳一次，而且兩個 worker 真的同時在做', async () => {
    for (let i = 0; i < 12; i++) await placeOrder(pool, 31 + i, { 14: 1 }, OCT)
    const calls: { worker: string; start: number; end: number; key: string }[] = []
    // 每次 PutObject 慢 300 ms，並記下上傳了哪個 key
    const slow = (worker: string) => new Proxy(s3, {
      get(target, prop) {
        if (prop !== 'send') return Reflect.get(target, prop, target)
        return async (cmd: { input: { Key?: string } }) => {
          if (!(cmd instanceof PutObjectCommand)) return target.send(cmd as never)
          const start = Date.now()
          await new Promise(r => setTimeout(r, 300))
          const res = await target.send(cmd)
          calls.push({ worker, start, end: Date.now(), key: cmd.input.Key! })
          return res
        }
      },
    }) as S3Client
    const loop = async (worker: string) => { while (await runWorker({ ...deps, s3: slow(worker) }, { once: true, batchSize: 3 }) > 0) { /* 下一批 */ } }
    await Promise.all([loop('A'), loop('B')])
    const sent = calls.map(c => c.key)
    assert.equal(sent.length, 12, `12 個事件上傳了 ${sent.length} 次收據：兩個 worker 拿到同一批事件，要用 FOR UPDATE SKIP LOCKED`)
    assert.equal(new Set(sent).size, 12, '每張收據剛好上傳一次')
    const a = calls.filter(c => c.worker === 'A'), b = calls.filter(c => c.worker === 'B')
    assert.ok(a.some(x => b.some(y => x.start < y.end && y.start < x.end)), '兩個 worker 從來沒有同時上傳：只寫 FOR UPDATE 時另一個 worker 會等鎖，要加 SKIP LOCKED')
    const { rows: [{ left }] } = await pool.query('SELECT count(*)::int AS left FROM outbox WHERE processed_at IS NULL')
    assert.equal(left, 0, '12 個事件都要完成')
    assert.equal((await doc(14)).sold, 12, '伯爵紅茶在 ES 的 sold 要是 12')
  })
})
