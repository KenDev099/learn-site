import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { usePg } from '../../helpers/pg.ts'
import { useEs } from '../../helpers/es.ts'
import { useS3 } from '../../helpers/s3.ts'
import { placeOrder } from './fixtures.ts'
import { createTables, MENU, MENU_MAPPINGS, type Deps, type MenuDoc } from './schema.ts'
import { findMissingReceipts, rebuildSearch } from './runbook.ts'
import { runWorker } from './worker.ts'

const pool = usePg(15)
const es = useEs(15, { requestTimeout: 30_000 })   // 機器忙時建索引可能超過 10 秒
const { s3, bucket } = useS3(15, 'receipts')
const ALIAS = 't15-menu'
const OLD = 't15-menu-20261001'
const NOW = Date.parse('2026-10-15T04:00:00Z')
let deps: Deps

const behindAlias = async () => await es.indices.existsAlias({ name: ALIAS }) ? Object.keys(await es.indices.getAlias({ name: ALIAS })).sort() : []
const pending = async () => (await pool.query('SELECT aggregate_id, count(*)::int AS n FROM outbox WHERE processed_at IS NULL GROUP BY aggregate_id ORDER BY aggregate_id')).rows
const exists = (key: string) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(() => true, () => false)

describe('練習 4：runbook：重建搜尋、找出缺收據的訂單', { timeout: 240_000 }, () => {
  before(async () => {
    await createTables(pool)
    // 舊索引的資料過期了：sold 都是 0、版本 1；PostgreSQL 裡的熱銷度已經變了
    await es.indices.create({ index: OLD, mappings: MENU_MAPPINGS, aliases: { [ALIAS]: {} } })
    await es.bulk({ refresh: true, operations: MENU.flatMap(({ stock, ...p }) => [
      { index: { _index: OLD, _id: String(p.id), version: 1, version_type: 'external' as const } }, { ...p, available: true, sold: 0 },
    ]) })
    await pool.query('UPDATE products SET sold = 40 + id, version = 3 WHERE id IN (12, 13)')
    // 列物件時每頁只回 2 筆（正式環境是 1,000 筆）：沒有照 NextContinuationToken 分頁，就只看得到第一頁
    const paged = new Proxy(s3, {
      get(target, prop) {
        if (prop !== 'send') return Reflect.get(target, prop, target)
        return (cmd: { input: { MaxKeys?: number } }) => {
          if (cmd instanceof ListObjectsV2Command) cmd.input.MaxKeys = 2
          return target.send(cmd as never)
        }
      },
    }) as S3Client
    deps = { pool, redis: undefined as never, es, index: ALIAS, s3: paged, bucket }
  })

  test('rebuildSearch：從 PostgreSQL 重建、別名換到新索引、舊索引刪除，過程中搜尋一次都沒失敗', async () => {
    let stop = false
    const seen: (number | string)[] = []
    const watcher = (async () => {
      while (!stop) {
        try { seen.push((await es.count({ index: ALIAS })).count) } catch (e) { seen.push((e as Error).message.slice(0, 80)) }
        await sleep(5)
      }
    })()
    let n
    try {
      n = await rebuildSearch(deps, 't15-menu-20261101')
    } finally {
      stop = true
      await watcher
    }
    assert.equal(n, 6, `rebuildSearch 要回傳寫入的商品數 6，實際 ${n}`)
    assert.ok(seen.length >= 3, '搜尋監看迴圈沒有跑到，重跑一次')
    const bad = seen.filter(c => c !== 6)
    assert.deepEqual(bad, [], `重建期間別名的搜尋出錯或筆數不對（${bad.slice(0, 3).join('；')}）：先建好、寫好、refresh 新索引，再用一個 updateAliases 請求切換，最後才刪舊索引`)
    assert.deepEqual(await behindAlias(), ['t15-menu-20261101'], '別名要只指向新索引')
    assert.equal(await es.indices.exists({ index: OLD }), false, '切換之後要刪掉舊索引')
    const d = await es.get<MenuDoc>({ index: ALIAS, id: '12' })
    assert.equal(d._source?.sold, 52, '拿鐵的 sold 要是 PostgreSQL 裡的 52')
    assert.equal(d._version, 3, '_version 要等於 products.version（3）：bulk 每筆帶 version 與 version_type: external')
  })

  test('索引被誤刪（別名也跟著不見）：rebuildSearch 照樣能把搜尋恢復', async () => {
    await es.indices.delete({ index: await behindAlias() })
    let n
    try {
      n = await rebuildSearch(deps, 't15-menu-20261102')
    } catch (e) {
      assert.fail(`別名不存在時 rebuildSearch 丟出「${(e as Error).message.slice(0, 100)}」：索引被刪時別名也消失了，舊索引清單要當成空的（先用 existsAlias 檢查）`)
    }
    assert.equal(n, 6)
    assert.deepEqual(await behindAlias(), ['t15-menu-20261102'], '別名要指向新建的索引')
    assert.equal((await es.count({ index: ALIAS })).count, 6, '搜尋要找得到 6 個商品')
  })

  const ids: number[] = []
  test('findMissingReceipts：找出沒有 receipt_key 或物件不存在的舊訂單，排入一次事件；重跑不重複排入', async () => {
    const hourAgo = new Date(NOW - 60 * 60_000)
    for (let i = 0; i < 5; i++) ids.push(await placeOrder(pool, 21 + i, { 15: 1 }, hourAgo))
    for (const id of ids) {
      const key = `receipts/2026/10/${id}.txt`
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: `收據 ${id}`, ContentType: 'text/plain; charset=utf-8' }))
      await pool.query('UPDATE orders SET receipt_key = $2 WHERE id = $1', [id, key])
    }
    await pool.query('UPDATE outbox SET processed_at = now()')
    const fresh = await placeOrder(pool, 29, { 15: 1 }, new Date(NOW - 60_000))   // 一分鐘前付款，worker 還沒處理：不算缺收據
    ids.push(fresh)
    // 事故：兩張收據被誤刪、一筆訂單的 receipt_key 被清掉
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [ids[1], ids[2]].map(id => ({ Key: `receipts/2026/10/${id}.txt` })) } }))
    await pool.query('UPDATE orders SET receipt_key = NULL WHERE id = $1', [ids[3]])

    const expected = [ids[1], ids[2], ids[3]]
    const found = await findMissingReceipts(deps, NOW)
    assert.deepEqual(found, expected, `要找到 ${expected.join('、')}（兩個物件被刪、一個 receipt_key 是 NULL），實際 ${JSON.stringify(found)}。` +
      (found.length === 1 ? '只檢查 receipt_key 是不是 NULL 不夠，key 指向的物件也可能不在了' : found.includes(fresh) ? '剛付款不到 10 分鐘的訂單還在等 worker，不算' : found.length > 3 ? '測試裡每頁只回 2 個物件：ListObjectsV2 要照 NextContinuationToken 一頁一頁讀完' : ''))
    const want = [...expected.map(id => ({ aggregate_id: id, n: 1 })), { aggregate_id: fresh, n: 1 }]
    assert.deepEqual(await pending(), want, '缺收據的訂單各要有一筆待處理的 order.paid 事件；剛付款那筆原本的事件不能多一筆')
    let again
    try {
      again = await findMissingReceipts(deps, NOW)
    } catch (e) {
      assert.fail(`再跑一次 findMissingReceipts 丟出「${(e as Error).message.slice(0, 100)}」：已經有待處理事件的訂單不能再插入一筆，用 ON CONFLICT DO NOTHING`)
    }
    assert.deepEqual(again, expected, '還沒補上之前，重跑要找到同樣的訂單')
    assert.deepEqual(await pending(), want, '重跑不能產生重複的事件：同一筆訂單只能有一筆待處理')
  })

  test('worker 跑完之後，所有收據都補齊（用你在練習 3 寫的 worker）', async () => {
    while (await runWorker(deps, { once: true }) > 0) { /* 下一批 */ }
    for (const id of ids) assert.ok(await exists(`receipts/2026/10/${id}.txt`), `訂單 ${id} 的收據還是不在：練習 3 的 worker 要能處理重新排入的事件`)
    assert.deepEqual(await findMissingReceipts(deps, NOW), [], '補齊之後 findMissingReceipts 要回傳空陣列')
  })
})
