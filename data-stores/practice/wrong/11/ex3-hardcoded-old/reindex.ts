// 練習 3：零停機重建索引：新索引 → 全量匯入 → 補上期間的變更 → 原子切換別名 → 刪舊索引
// reindexWithAlias(pool, es, alias, newIndex, mappings)：
//   1. 查出 alias 目前指向哪些索引（es.indices.getAlias({ name: alias })），不要寫死舊索引的名稱
//   2. 記下 outbox 目前最大的 id（匯入期間的變更會在它之後）
//   3. 用 mappings 建立 newIndex
//   4. 全量匯入：用 pool.query 一次讀出 products（練習資料只有幾十筆），bulk 寫進 newIndex，每筆帶 version 與 version_type: 'external'
//   5. 補上變更：outbox 裡 id 大於第 2 步記下的值的事件，照練習 2 的方式寫進 newIndex（不管 processed_at，版本號會擋掉重複與亂序）
//   6. refresh newIndex（不然剛寫的文件還搜不到）
//   7. 用「一個」es.indices.updateAliases 請求：移除舊索引的別名、把別名加到 newIndex
//   8. 再補一次第 5 步（切換前一刻才送到舊索引的變更）
//   9. 刪除舊索引
// bulk 的回應要檢查：除了 409、delete 的 404 之外有任何錯誤就丟錯，不要切換
import type { Pool } from 'pg'
import type { Client } from '@elastic/elasticsearch'
import type { OutboxEvent, Product } from './schema.ts'

async function bulkOrThrow(es: Client, operations: unknown[]) {
  if (operations.length === 0) return
  const res = await es.bulk({ operations: operations as never })
  const bad = res.items.filter(item => {
    const r = (item.index ?? item.delete)!
    return !(r.status < 300 || r.status === 409 || (item.delete && r.status === 404))
  })
  if (bad.length) throw new Error(`bulk 有 ${bad.length} 筆失敗：${JSON.stringify(bad[0])}`)
}

export async function reindexWithAlias(pool: Pool, es: Client, alias: string, newIndex: string, mappings: Record<string, unknown>): Promise<void> {
  const oldIndices = ['t11-menu-v1']
  const { rows: [{ mark }] } = await pool.query<{ mark: string }>('SELECT coalesce(max(id), 0) AS mark FROM outbox')
  await es.indices.create({ index: newIndex, mappings })

  const { rows: products } = await pool.query<Product>('SELECT id, name, category, price, available, version FROM products ORDER BY id')
  await bulkOrThrow(es, products.flatMap(({ version, ...doc }) => [
    { index: { _index: newIndex, _id: String(doc.id), version, version_type: 'external' } }, doc,
  ]))

  const replay = async () => {
    const { rows } = await pool.query<OutboxEvent>('SELECT id, aggregate_id, version, op, payload FROM outbox WHERE id > $1 ORDER BY id', [mark])
    await bulkOrThrow(es, rows.flatMap((e): object[] => {
      const meta = { _index: newIndex, _id: String(e.aggregate_id), version: e.version, version_type: 'external' }
      return e.op === 'delete' ? [{ delete: meta }] : [{ index: meta }, e.payload!]
    }))
  }
  await replay()
  await es.indices.refresh({ index: newIndex })
  await es.indices.updateAliases({
    actions: [
      ...oldIndices.map(index => ({ remove: { index, alias } })),
      { add: { index: newIndex, alias } },
    ],
  })
  await replay()
  if (oldIndices.length) await es.indices.delete({ index: oldIndices })
}
