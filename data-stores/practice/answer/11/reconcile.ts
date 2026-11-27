// 練習 4：對帳：比對 PostgreSQL 與 Elasticsearch 的 (id, version)，找出差異並修正
// reconcile(pool, es, alias) 回傳三種差異的商品 id（各自由小到大排序）：
//   missing：products 有、ES 沒有
//   stale：兩邊都有，但 ES 的 _version 比 products.version 舊
//   orphaned：ES 有、products 沒有（已經刪掉的商品還搜得到）
// 走訪 ES：每頁最多 1000 筆，sort: [{ id: 'asc' }] 加 search_after 一頁一頁往下讀，version: true 才拿得到 _version，_source: false
//   （from + size 不能超過 10,000，練習資料有一萬多筆）
// 修正：missing 與 stale 用 products 的內容 index（帶 version: products.version、version_type: 'external'）
//       orphaned 用 delete（帶 version: ES 的 _version + 1、version_type: 'external'）
// products 很多時不要一次全部送：bulk 每批最多 1000 個動作
import type { Pool } from 'pg'
import type { Client, estypes } from '@elastic/elasticsearch'
import type { Product } from './schema.ts'

export type Diff = { missing: number[]; stale: number[]; orphaned: number[] }

const PAGE = 1000

export async function reconcile(pool: Pool, es: Client, alias: string): Promise<Diff> {
  // ponytail: 兩邊都整份讀進記憶體，幾十萬筆以內夠用；更大時改成兩邊都依 id 排序、分段比對
  const { rows } = await pool.query<Product>('SELECT id, name, category, price, available, version FROM products')
  const db = new Map(rows.map(p => [p.id, p]))

  const inEs = new Map<number, number>()   // id → _version
  let after: estypes.SortResults | undefined
  for (;;) {
    const res = await es.search({
      index: alias, size: PAGE, sort: [{ id: 'asc' }], search_after: after,
      version: true, _source: false, query: { match_all: {} },
    })
    const hits = res.hits.hits
    for (const h of hits) inEs.set(Number(h._id), h._version!)
    if (hits.length < PAGE) break
    after = hits.at(-1)!.sort
  }

  const byId = (a: number, b: number) => a - b
  const missing = [...db.keys()].filter(id => !inEs.has(id)).sort(byId)
  const stale = [...db.values()].filter(p => inEs.has(p.id) && inEs.get(p.id)! < p.version).map(p => p.id).sort(byId)
  const orphaned = [...inEs.keys()].filter(id => !db.has(id)).sort(byId)

  const ops: unknown[][] = [
    ...[...missing, ...stale].map(id => {
      const { version, ...doc } = db.get(id)!
      return [{ index: { _index: alias, _id: String(id), version, version_type: 'external' } }, doc]
    }),
    ...orphaned.map(id => [{ delete: { _index: alias, _id: String(id), version: inEs.get(id)! + 1, version_type: 'external' } }]),
  ]
  for (let i = 0; i < ops.length; i += PAGE) {
    const res = await es.bulk({ operations: ops.slice(i, i + PAGE).flat() as never })
    const bad = res.items.find(item => {
      const r = (item.index ?? item.delete)!
      return !(r.status < 300 || r.status === 409 || (item.delete && r.status === 404))
    })
    if (bad) throw new Error(`修正失敗：${JSON.stringify(bad)}`)
  }
  return { missing, stale, orphaned }
}
