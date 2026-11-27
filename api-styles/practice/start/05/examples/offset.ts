// OFFSET 分頁遇到新訂單：第 2 頁的第一筆是第 1 頁看過的。在 work/05 執行 node examples/offset.ts
import { createDb } from '../../../helpers/db.ts'

type Row = { id: number, ordered_at: Date }
const { db, pg } = await createDb()
const show = (rows: Row[]) => rows.map(r => `#${r.id}`).join(' ')

// 王小明（customer_id = 1）的訂單，一頁 2 筆，由新到舊
const offsetPage = (offset: number) => db.query<Row>(
  'SELECT id, ordered_at FROM orders WHERE customer_id = 1 ORDER BY ordered_at DESC, id DESC LIMIT 2 OFFSET $1', [offset])
const keysetPage = (after: Row) => db.query<Row>(
  'SELECT id, ordered_at FROM orders WHERE customer_id = 1 AND (ordered_at, id) < ($1, $2) ORDER BY ordered_at DESC, id DESC LIMIT 2',
  [after.ordered_at.toISOString(), after.id])

const page1 = await offsetPage(0)
console.log('第 1 頁：', show(page1))

await pg.query("INSERT INTO orders (customer_id, ordered_at, total) VALUES (1, '2026-10-26 09:00+08', 110)")
console.log('…王小明又下了一張訂單…')

console.log('OFFSET 2 的第 2 頁：', show(await offsetPage(2)))
console.log('keyset 的第 2 頁（從 #' + page1.at(-1)!.id + ' 之後）：', show(await keysetPage(page1.at(-1)!)))
process.exit(0)   // 不等測試框架的收尾（createDb 的 after），直接結束
