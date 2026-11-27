// offset 分頁 vs cursor 分頁：翻頁途中有新訂單進來會怎樣
// 執行：node examples/offset-vs-cursor.ts
type Row = { id: number, createdAt: string }

// 10 筆訂單，id 越大越新；新的在前
let rows: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, createdAt: `2026-10-31T08:00:${String(i).padStart(2, '0')}.000Z` }))
const newestFirst = (a: Row, b: Row) => a.createdAt === b.createdAt ? b.id - a.id : (a.createdAt < b.createdAt ? 1 : -1)
const ids = (list: Row[]) => list.map(r => r.id).join(', ')

// offset：跳過前面幾筆（SQL 的 LIMIT 3 OFFSET n）
const offsetPage = (offset: number) => [...rows].sort(newestFirst).slice(offset, offset + 3)
// cursor：只拿「比上一頁最後一筆還舊」的（SQL 的 WHERE (created_at, id) < ($1, $2)）
const cursorPage = (after: Row | null) => [...rows].sort(newestFirst)
  .filter(r => after === null || r.createdAt < after.createdAt || (r.createdAt === after.createdAt && r.id < after.id))
  .slice(0, 3)

const o1 = offsetPage(0)
const c1 = cursorPage(null)
console.log('第一頁         offset:', ids(o1), '｜ cursor:', ids(c1))

// 使用者看第一頁的時候，進來兩筆新訂單
rows = [...rows, { id: 11, createdAt: '2026-10-31T08:01:00.000Z' }, { id: 12, createdAt: '2026-10-31T08:01:01.000Z' }]
console.log('（新增了訂單 11、12）')

const o2 = offsetPage(3)
const c2 = cursorPage(c1.at(-1) ?? null)
console.log('第二頁         offset:', ids(o2), '｜ cursor:', ids(c2))
const dup = o2.filter(r => o1.some(x => x.id === r.id))
console.log('offset 第二頁重複出現：', dup.length ? ids(dup) : '無')
