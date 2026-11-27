// 練習 4：runbook 用的兩個工具
//
// rebuildSearch(deps, newIndex)：從 PostgreSQL 重建菜單索引，搜尋全程不中斷，回傳寫入的商品數
//   1. 查出別名 deps.index 目前指向哪些索引（可能一個都沒有：索引被誤刪時別名也跟著消失）
//   2. 用 MENU_MAPPINGS 建立 newIndex
//   3. 讀 products 全部（id, name, category, price, available, sold, version），一個 bulk 寫進 newIndex，
//      每筆帶 version 與 version_type: 'external'；逐筆檢查結果，有失敗就丟錯（不要切換）
//   4. refresh newIndex
//   5. 用「一個」updateAliases 請求：把別名從舊索引移除、加到 newIndex
//   6. 刪除舊索引
//
// findMissingReceipts(deps, now)：找出缺收據的訂單、重新排入 outbox，回傳訂單 id（由小到大）
//   - 範圍：created_at 早於 now - RECEIPT_GRACE_MS 的訂單（剛付款的還在等 worker，不算）
//   - 缺收據：receipt_key 是 NULL，或 receipt_key 指向的物件不在 bucket 裡（列出 receipts/ 底下的物件來比對，記得分頁）
//   - 每筆缺收據的訂單排入一個 order.paid 事件；已經有待處理事件的訂單不能多一筆（outbox 有部分唯一索引，用 ON CONFLICT DO NOTHING）
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { MENU_MAPPINGS, RECEIPT_GRACE_MS, type Deps, type MenuDoc } from './schema.ts'

export async function rebuildSearch({ pool, es, index: alias }: Deps, newIndex: string): Promise<number> {
  const oldIndices = await es.indices.existsAlias({ name: alias })
    ? Object.keys(await es.indices.getAlias({ name: alias }))
    : []
  await es.indices.create({ index: newIndex, mappings: MENU_MAPPINGS })

  const { rows } = await pool.query<MenuDoc & { version: number }>('SELECT id, name, category, price, available, sold, version FROM products ORDER BY id')
  if (rows.length) {
    const res = await es.bulk({
      operations: rows.flatMap(({ version, ...doc }) => [
        { index: { _index: newIndex, _id: String(doc.id), version, version_type: 'external' as const } }, doc,
      ]),
    })
    const bad = res.items.filter(item => item.index!.status >= 300 && item.index!.status !== 409)
    if (bad.length) throw new Error(`重建時有 ${bad.length} 筆寫入失敗，別名沒有切換：${JSON.stringify(bad[0])}`)
  }
  await es.indices.refresh({ index: newIndex })

  await es.indices.updateAliases({
    actions: [
      ...oldIndices.map(index => ({ remove: { index, alias } })),
      { add: { index: newIndex, alias } },
    ],
  })
  if (oldIndices.length) await es.indices.delete({ index: oldIndices })
  return rows.length
}

export async function findMissingReceipts({ pool, s3, bucket }: Deps, now: number): Promise<number[]> {
  const { rows } = await pool.query<{ id: number; receipt_key: string | null }>(
    'SELECT id, receipt_key FROM orders WHERE created_at < $1 ORDER BY id', [new Date(now)])

  const stored = new Set<string>()
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'receipts/', ContinuationToken: token }))
    for (const o of page.Contents ?? []) stored.add(o.Key!)
    token = page.NextContinuationToken
  } while (token)

  const missing = rows.filter(r => !r.receipt_key || !stored.has(r.receipt_key)).map(r => r.id)
  if (missing.length) {
    await pool.query(`INSERT INTO outbox (type, aggregate_id) SELECT 'order.paid', unnest($1::int[]) ON CONFLICT DO NOTHING`, [missing])
  }
  return missing
}
