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
import type { Client } from '@elastic/elasticsearch'

export type Diff = { missing: number[]; stale: number[]; orphaned: number[] }

export async function reconcile(pool: Pool, es: Client, alias: string): Promise<Diff> {
  // 寫在這裡
  return { missing: [], stale: [], orphaned: [] }
}
