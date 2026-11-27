// 練習 4：游標分頁。翻頁途中有人新增活動，也不會重複或漏掉
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small')
type Item = { id: string; startsAt: string }

async function create(startsAt: Date) {
  const res = await call(t, 'POST', '/api/v1/events', { body: { title: '分頁測試', startsAt: startsAt.toISOString(), capacity: 5 } })
  expect(res.status, `POST /api/v1/events 要 201：${res.text.slice(0, 200)}`).toBe(201)
  return res.body as Item
}
const before = (a: Item, b: Item) => a.startsAt < b.startsAt || (a.startsAt === b.startsAt && a.id < b.id)

describe('練習 4：游標分頁', () => {
  it('limit=5 走完全部：依 startsAt（相同時依 id）排序、不重複、這次建立的 12 筆都出現一次；翻頁途中插入的資料不影響', async () => {
    // 12 筆排在很後面的活動；同一個時間建 3 筆，排序要靠 id 才分得出先後
    const base = Date.now() + 400 * 86_400_000
    const seeded: Item[] = []
    for (let i = 0; i < 12; i++) seeded.push(await create(new Date(base + Math.floor(i / 3) * 60_000)))
    const mine = new Set(seeded.map(e => e.id))

    const seen: Item[] = []
    let cursor: string | null = null, inserted = false
    for (let page = 0; ; page++) {
      expect(page, '翻了 1000 頁還沒結束：nextCursor 在最後一頁要是 null').toBeLessThan(1000)
      const res = await call(t, 'GET', `/api/v1/events?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      expect(res.status, `GET /api/v1/events 要 200：${res.text.slice(0, 200)}`).toBe(200)
      expect(Array.isArray(res.body?.items), '回應要是 { items, nextCursor }').toBe(true)
      expect(res.body.items.length, 'limit=5 時一頁最多 5 筆').toBeLessThanOrEqual(5)
      seen.push(...res.body.items)
      cursor = res.body.nextCursor
      if (!cursor) break
      // 第一次看到這次建立的活動時，在它前面插入 2 筆（排序在已經看過的資料之間）：offset 分頁下一頁會重複
      const first = res.body.items.find((e: Item) => mine.has(e.id))
      if (first && !inserted) {
        inserted = true
        const at = new Date(first.startsAt).getTime()
        await create(new Date(at - 2000))
        await create(new Date(at - 1000))
      }
    }

    expect(inserted, '翻頁時一直沒看到這次建立的活動：列表要依 startsAt 由早到晚排序').toBe(true)
    const ids = seen.map(e => e.id)
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(dup, '有活動在不同頁重複出現：offset 分頁在翻頁途中有人新增資料就會重複，改用游標（上一頁最後一筆的 startsAt＋id）').toEqual([])
    const missing = seeded.filter(e => !ids.includes(e.id)).map(e => e.id)
    expect(missing, '這次建立的活動有幾筆沒出現在任何一頁：nextCursor 算錯或比較條件少了「startsAt 相同時比 id」').toEqual([])
    const bad = seen.findIndex((e, i) => i > 0 && !before(seen[i - 1], e))
    expect(bad, `第 ${bad} 筆排序不對：要依 startsAt 由早到晚、相同時依 id`).toBe(-1)
  })
})
