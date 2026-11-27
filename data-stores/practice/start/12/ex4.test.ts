import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { GetBucketLifecycleConfigurationCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { usePg } from '../../helpers/pg.ts'
import { useS3 } from '../../helpers/s3.ts'
import { createTables } from './receipts.ts'
import { applyLifecycle, cleanupOrphans } from './lifecycle.ts'

const pool = usePg(12)
const { s3, bucket } = useS3(12, 'receipts')

const HOUR = 3_600_000
async function putAll(keys: string[]) {
  for (let i = 0; i < keys.length; i += 50) {
    await Promise.all(keys.slice(i, i + 50).map(Key => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body: 'x', ContentType: 'application/pdf' }))))
  }
}
async function allKeys() {
  const keys: string[] = []
  let token: string | undefined
  do {
    const p = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    keys.push(...(p.Contents ?? []).map(o => o.Key!))
    token = p.NextContinuationToken
  } while (token)
  return new Set(keys)
}

describe('練習 4：生命週期規則與孤兒清理', { timeout: 300_000 }, () => {
  // 建表放在 describe 裡的 before：檔案最上層的 before 會跟 usePg、useS3 的準備同時執行
  before(async () => { await createTables(pool) })

  test('applyLifecycle：tmp/ 1 天後刪除、中斷的分段上傳 1 天後清掉，不碰 receipts/', async () => {
    await applyLifecycle({ s3, bucket })
    const { Rules = [] } = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
    const on = Rules.filter(r => r.Status === 'Enabled')
    const expire = on.filter(r => r.Expiration)
    assert.equal(expire.length, 1, `應該剛好有 1 條刪除物件（Expiration）的規則，實際 ${expire.length} 條`)
    assert.equal(expire[0].Filter?.Prefix, 'tmp/', `刪除物件的規則只能套用在 tmp/（Filter: { Prefix: 'tmp/' }），實際是 ${JSON.stringify(expire[0].Filter ?? {})}：套到整個 bucket 會把正式收據也刪掉`)
    assert.equal(expire[0].Expiration?.Days, 1, 'tmp/ 要 1 天後刪除')
    const abort = on.find(r => r.AbortIncompleteMultipartUpload)
    assert.ok(abort, '缺少清除中斷分段上傳的規則（AbortIncompleteMultipartUpload）')
    assert.equal(abort.AbortIncompleteMultipartUpload?.DaysAfterInitiation, 1, '中斷的分段上傳要在 1 天後清掉')
    assert.ok(!abort.Filter?.Prefix, '中斷的分段上傳要清整個 bucket（Filter 不加 prefix）：任何 prefix 都可能有人上傳到一半')
  })

  test('cleanupOrphans：1,200 個物件中刪掉孤兒與超時的 pending，正常的收據不動', async () => {
    const now = Date.now()
    const key = (i: number) => `receipts/2026/11/${String(i).padStart(4, '0')}.pdf`
    // 0000～1199：1,200 個物件。孤兒是 0010～0019（第一頁）與 1150～1199（第二頁）
    const keys = Array.from({ length: 1200 }, (_, i) => key(i))
    const orphan = (i: number) => (i >= 10 && i < 20) || i >= 1150
    await putAll([...keys, 'tmp/export-15.csv'])
    await pool.query('INSERT INTO orders (id, customer_id) VALUES (15, 21)')
    // 有紀錄的物件：大多是 uploaded；1100 是 3 小時前的 pending（超時），1101 是 10 分鐘前的 pending（還在有效期）
    const rows = keys.map((k, i) => ({ k, i })).filter(({ i }) => !orphan(i))
    const status = (i: number) => i === 1100 || i === 1101 ? 'pending' : 'uploaded'
    const created = (i: number) => i === 1100 ? now - 3 * HOUR : i === 1101 ? now - 10 * 60_000 : now - 48 * HOUR
    await pool.query(
      `INSERT INTO receipts (order_id, s3_key, content_type, size, status, created_at)
       SELECT 15, k, 'application/pdf', 1, s, to_timestamp(c / 1000.0) FROM unnest($1::text[], $2::text[], $3::float8[]) AS t(k, s, c)`,
      [rows.map(r => r.k), rows.map(r => status(r.i)), rows.map(r => created(r.i))])
    // 還有一筆超時 pending 的物件根本沒上傳
    await pool.query(`INSERT INTO receipts (order_id, s3_key, content_type, size, created_at) VALUES (15, 'receipts/2026/11/never.pdf', 'application/pdf', 1, to_timestamp($1 / 1000.0))`, [now - 5 * HOUR])

    const out = await cleanupOrphans(pool, { s3, bucket }, now - HOUR)

    const left = await allKeys()
    const firstPage = [10, 15, 19].map(key).filter(k => left.has(k))
    const secondPage = [1150, 1170, 1199].map(key).filter(k => left.has(k))
    assert.deepEqual(firstPage, [], `孤兒沒被刪：${firstPage.join('、')}`)
    assert.deepEqual(secondPage, [], `第 1,000 個之後的孤兒沒被刪（${secondPage.join('、')}）：ListObjectsV2 一次最多 1,000 個，要用 NextContinuationToken 繼續`)
    assert.ok(!left.has(key(1100)), '3 小時前的 pending（超過 olderThan）的物件要刪掉')
    assert.ok(left.has(key(1101)), '10 分鐘前的 pending 還在有效期內，前端可能正在上傳，不能刪物件')
    const kept = keys.filter((_, i) => !orphan(i) && i !== 1100 && !left.has(key(i)))
    assert.deepEqual(kept.slice(0, 5), [], `有紀錄的正常收據被刪了：${kept.slice(0, 5).join('、')}`)
    assert.ok(left.has('tmp/export-15.csv'), 'tmp/ 不歸 cleanupOrphans 管（交給生命週期規則），只處理 receipts/')

    const pend = (await pool.query(`SELECT s3_key FROM receipts WHERE status = 'pending' ORDER BY s3_key`)).rows.map(r => r.s3_key)
    assert.deepEqual(pend, [key(1101)], `只該留下還在有效期的 pending 紀錄，實際剩下：${pend.join('、')}`)
    const n = (await pool.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n
    assert.equal(n, rows.length - 1, 'uploaded 的紀錄不能被刪')
    assert.deepEqual(out, { deletedObjects: 61, deletedPending: 2 }, `回傳值應該是 60 個孤兒＋1 個超時 pending 的物件、2 筆 pending 紀錄，實際 ${JSON.stringify(out)}`)
  })
})
