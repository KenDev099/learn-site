import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@elastic/elasticsearch'
import { usePg } from '../../helpers/pg.ts'
import { useEs } from '../../helpers/es.ts'
import { createTables, MENU, MENU_MAPPINGS, type Doc } from './schema.ts'
import { runOnce } from './sync-worker.ts'

const pool = usePg(11)
const es = useEs(11, { requestTimeout: 60_000 })   // 建索引要等 shard 啟動，機器忙時會超過 10 秒
const ALIAS = 't11-menu'

const doc = (id: number, patch: Partial<Doc> = {}): Doc => ({ ...(MENU.find(m => m.id === id) ?? { id, name: `季節特調 ${id}`, category: 'coffee', price: 100, available: true }), ...patch })
async function addEvent(id: number, version: number, op: 'upsert' | 'delete', payload: unknown = null) {
  await pool.query('INSERT INTO outbox (aggregate_id, version, op, payload) VALUES ($1, $2, $3, $4)', [id, version, op, op === 'delete' ? null : JSON.stringify(payload)])
}
const pending = async () => (await pool.query('SELECT aggregate_id, version, attempts FROM outbox WHERE processed_at IS NULL ORDER BY id')).rows
async function getDoc(id: number) {
  const r = await es.get<Doc>({ index: ALIAS, id: String(id) }, { ignore: [404] })
  return r.found ? { version: r._version, source: r._source } : null
}

describe('練習 2：outbox worker 用 bulk 同步到 Elasticsearch', { timeout: 120_000 }, () => {
  before(async () => {
    await createTables(pool)
    await es.indices.create({ index: 't11-menu-v1', mappings: MENU_MAPPINGS, aliases: { [ALIAS]: {} } })
  })

  test('upsert 寫進 ES（_version 等於商品版本），delete 移除文件；完成的事件標上 processed_at', async () => {
    await addEvent(11, 3, 'upsert', doc(11))
    await addEvent(12, 2, 'upsert', doc(12, { price: 120 }))
    assert.equal(await runOnce(pool, es, ALIAS, 10), 2, 'runOnce 要回傳這一輪處理完成的事件數')
    const d11 = await getDoc(11)
    assert.ok(d11, '美式咖啡（11）要寫進 ES；要寫進傳進來的 index 參數（別名）')
    assert.equal(d11.version, 3, `ES 的 _version 要等於事件的 version（3），實際 ${d11.version}：index 要帶 version 與 version_type: 'external'`)
    assert.equal((await getDoc(12))?.source?.price, 120, '拿鐵在 ES 的價格要是 120')
    assert.deepEqual(await pending(), [], '成功送出的事件要設 processed_at')
    await addEvent(11, 4, 'delete')
    assert.equal(await runOnce(pool, es, ALIAS, 10), 1, 'delete 事件也算一筆')
    assert.equal(await getDoc(11), null, 'delete 事件要把 ES 的文件刪掉')
    assert.equal(await runOnce(pool, es, ALIAS, 10), 0, '沒有待處理的事件時回傳 0')
  })

  test('亂序：先送 version 5 再送 version 4，ES 留下 version 5；舊事件算處理完成', async () => {
    await addEvent(13, 5, 'upsert', doc(13, { name: '卡布奇諾（燕麥奶）' }))
    await addEvent(13, 4, 'upsert', doc(13, { name: '卡布奇諾（舊）' }))
    const n = await runOnce(pool, es, ALIAS, 10)
    const d13 = await getDoc(13)
    assert.equal(d13?.source?.name, '卡布奇諾（燕麥奶）', `ES 裡是「${d13?.source?.name}」：舊事件（version 4）覆蓋了新資料，index 要帶 version_type: 'external'`)
    assert.equal(d13?.version, 5, 'ES 的 _version 要停在 5')
    assert.equal(n, 2, `回傳 ${n}：版本衝突（409）代表 ES 已經有更新的版本，這筆事件算完成，不要留著無限重試`)
    assert.deepEqual(await pending(), [], '版本衝突的舊事件也要標上 processed_at')
  })

  test('刪除之後才到的舊事件，不能讓商品在搜尋裡復活', async () => {
    await addEvent(14, 3, 'upsert', doc(14))
    await addEvent(14, 6, 'delete')
    await runOnce(pool, es, ALIAS, 10)
    await addEvent(14, 5, 'upsert', doc(14))   // 延遲送到的 version 5
    await runOnce(pool, es, ALIAS, 10)
    assert.equal(await getDoc(14), null, '伯爵紅茶已經在 version 6 刪除，晚到的 version 5 不能把它加回來：delete 也要帶 version 與 version_type: external')
    assert.deepEqual(await pending(), [], '晚到的舊事件算處理完成')
  })

  test('bulk 裡個別失敗的事件不能標記完成：attempts 加 1，其他照常完成', async () => {
    await addEvent(15, 2, 'upsert', { ...doc(15), price: '七十元' })   // price 是 integer，這筆會被 ES 拒絕
    await addEvent(16, 2, 'upsert', doc(16))
    const n = await runOnce(pool, es, ALIAS, 10)
    const left = await pending()
    assert.deepEqual(left.map(e => e.aggregate_id), [15], `bulk 回 HTTP 200 也可能有個別幾筆失敗（errors: true）：要逐筆檢查 items，失敗的不能標 processed_at。還沒完成的事件：${JSON.stringify(left)}`)
    assert.equal(left[0].attempts, 1, '失敗的事件 attempts 要加 1')
    assert.equal(n, 1, '回傳值只算成功的那一筆')
    assert.ok(await getDoc(16), '同一批的起司蛋糕照常寫進 ES')
    await pool.query('DELETE FROM outbox WHERE aggregate_id = 15')
  })

  test('ES 連不上：runOnce 丟錯，事件留著；恢復後補上', async () => {
    const down = new Client({ node: 'http://127.0.0.1:9', maxRetries: 0, requestTimeout: 2_000 })   // 沒有服務的 port，模擬 ES 當機
    try {
      await addEvent(12, 3, 'upsert', doc(12, { price: 125 }))
      await assert.rejects(runOnce(pool, down, ALIAS, 10), 'ES 連不上時 runOnce 要把錯誤往外丟（讓排程記錄、告警、稍後重試）')
      assert.deepEqual((await pending()).map(e => e.aggregate_id), [12], 'ES 失敗時事件不能標記完成：ROLLBACK，留到下一輪')
    } finally {
      await down.close()
    }
    assert.equal(await runOnce(pool, es, ALIAS, 10), 1, 'ES 恢復後要把留下的事件送出去')
    assert.equal((await getDoc(12))?.source?.price, 125, '拿鐵在 ES 的價格要更新成 125')
  })

  test('兩個 worker 並發處理 200 個事件：每個事件只送一次，而且兩個 worker 真的同時在送', async () => {
    for (let i = 0; i < 200; i++) await addEvent(1000 + i, 2, 'upsert', doc(1000 + i))
    const calls: { worker: string; start: number; end: number; ids: string[] }[] = []
    // 每次 bulk 慢 300 ms，並記下送了哪些文件
    const slow = (worker: string) => new Proxy(es, {
      get(target, prop) {
        if (prop !== 'bulk') return Reflect.get(target, prop, target)
        return async (params: { operations: Record<string, { _id: string }>[] }) => {
          const start = Date.now()
          await new Promise(r => setTimeout(r, 300))
          const ids = params.operations.map(o => (o.index ?? o.delete)?._id).filter(Boolean)
          const res = await target.bulk(params as never)
          calls.push({ worker, start, end: Date.now(), ids })
          return res
        }
      },
    }) as Client
    const loop = async (worker: string) => { let n = 0; while (await runOnce(pool, slow(worker), ALIAS, 20) > 0) n++; return n }
    await Promise.all([loop('A'), loop('B')])
    const sent = calls.flatMap(c => c.ids)
    assert.equal(sent.length, 200, `200 個事件送出了 ${sent.length} 次：兩個 worker 拿到同一批事件，要用 FOR UPDATE SKIP LOCKED 鎖住並跳過別人鎖住的列`)
    assert.equal(new Set(sent).size, 200, '每個事件剛好送一次')
    const a = calls.filter(c => c.worker === 'A'), b = calls.filter(c => c.worker === 'B')
    const overlap = a.some(x => b.some(y => x.start < y.end && y.start < x.end))
    assert.ok(overlap, '兩個 worker 一直輪流送、從來沒有同時送：只寫 FOR UPDATE 時，另一個 worker 會卡在同一批列的鎖上等，要加 SKIP LOCKED')
    assert.deepEqual(await pending(), [], '200 個事件都要完成')
  })
})
