import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import type { Client } from '@elastic/elasticsearch'
import { useEs } from '../../helpers/es.ts'
import { seedMenu } from './menu.ts'
import { buildQuery, searchMenu } from './search.ts'

const es = useEs(10)
const index = 't10-ex2-menu'
before(() => seedMenu(es, index))

// 找出查詢裡的 bool（可能被 function_score 之類的包住）
function findBool(q: unknown): Record<string, unknown> | undefined {
  if (!q || typeof q !== 'object') return undefined
  const o = q as Record<string, unknown>
  if (o.bool) return o.bool as Record<string, unknown>
  for (const v of Object.values(o)) { const b = findBool(v); if (b) return b }
}
const list = (v: unknown) => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const json = (v: unknown) => JSON.stringify(v ?? null)

// 把 client 包起來，記下送出的 search 參數
function recording(calls: Record<string, unknown>[]): Client {
  return new Proxy(es, {
    get(target, prop) {
      const v = Reflect.get(target, prop)
      if (prop === 'search') return (req: Record<string, unknown>, ...rest: unknown[]) => { calls.push(req); return target.search(req as never, ...rest as []) }
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

describe('練習 2：搜尋菜單', { timeout: 30_000 }, () => {
  test('buildQuery：篩選條件在 bool.filter，不在 must／should', () => {
    const body = buildQuery({ q: '拿鐵', category: '咖啡', maxPrice: 120, onlyAvailable: true })
    const bool = findBool(body.query)
    assert.ok(bool, `query 裡要有 bool 查詢，實際是 ${json(body.query)}`)
    const filter = json(bool.filter), scored = json([bool.must, bool.should])
    assert.match(filter, /"category"/, 'category 要放在 bool.filter（只決定要不要，不影響分數）')
    assert.match(filter, /"price"/, 'maxPrice 要用 range 放在 bool.filter')
    assert.match(filter, /"available"/, 'onlyAvailable 要放在 bool.filter')
    assert.match(filter, /"lte":120/, '價格是「小於等於」maxPrice：range 用 lte')
    assert.doesNotMatch(scored, /"category"|"price"|"available"/, '篩選條件不要放在 must／should：會被算進分數、影響排序')
    assert.match(scored, /拿鐵/, '關鍵字 q 要放在 must（要算分數）')
  })

  test('buildQuery：沒給的篩選條件不出現，不用 wildcard／regexp', () => {
    const body = buildQuery({ q: '拿鐵' })
    const bool = findBool(body.query)
    assert.ok(bool, 'query 裡要有 bool 查詢')
    assert.equal(list(bool.filter).length, 0, `沒給 category、maxPrice、onlyAvailable 時 filter 要是空的，實際 ${json(bool.filter)}`)
    assert.doesNotMatch(json(body), /wildcard|regexp|query_string|"\*/, '不要用 wildcard／regexp：用不到倒排索引、要掃過所有詞，也沒有相關性分數；全文搜尋用 match／multi_match')
    assert.equal(body.size, 10, 'size 要是 10：最多回傳 10 筆')
    const off = json(findBool(buildQuery({ q: '拿鐵', onlyAvailable: false }).query)?.filter)
    assert.doesNotMatch(off, /"available"/, `onlyAvailable: false 表示不篩供應狀態，filter 不能有 available，實際 ${off}`)
    const zero = json(findBool(buildQuery({ q: '拿鐵', maxPrice: 0 }).query)?.filter)
    assert.match(zero, /"lte":0/, `maxPrice: 0 也是有給的條件（0 元以下），要篩選；不要用 if (p.maxPrice) 判斷，0 會被當成沒給。實際 filter ${zero}`)
  })

  test('只取需要的欄位：_source 只有 name', async () => {
    const calls: Record<string, unknown>[] = []
    await searchMenu(recording(calls), index, { q: '拿鐵' })
    assert.equal(calls.length, 1, `searchMenu 要呼叫一次 es.search，實際 ${calls.length} 次`)
    const src = calls[0]!._source
    const fields = Array.isArray(src) ? src : typeof src === 'string' ? [src] : (src as { includes?: string[] } | undefined)?.includes
    assert.ok(fields, `_source 要限制欄位（例如 ['name']），實際是 ${json(src)}：沒限制會把 description 等整份文件傳回來`)
    assert.deepEqual([...fields].sort(), ['name'], `_source 只要 name，實際 ${json(fields)}`)
  })

  test('名稱命中排在只有描述命中的前面', async () => {
    const hits = await searchMenu(es, index, { q: '拿鐵' })
    assert.equal(hits.length, 10, `「拿鐵」有 11 筆符合，要回傳前 10 筆，實際 ${hits.length} 筆`)
    const names = hits.map(h => h.name)
    const firstDescOnly = names.findIndex(n => !n.includes('拿鐵'))
    assert.equal(firstDescOnly, 9, `前 9 筆都要是名稱有「拿鐵」的商品，第 10 筆才是只有描述提到拿鐵的；實際順序：${names.join('、')}。用 multi_match 的 fields 替 name 加權（例如 name^3）`)
    assert.equal(hits[0]!.id, '11', `第一名要是「拿鐵」（id 11，名稱最短、最貼近），實際是 ${names[0]}`)
    assert.equal(typeof hits[0]!.id, 'string', 'id 是文件的 _id（字串）')
    for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1]!.score >= hits[i]!.score, 'score 是 _score，要由高到低')
  })

  test('「冰拿鐵」：冰拿鐵第一，拿鐵第二', async () => {
    const hits = await searchMenu(es, index, { q: '冰拿鐵' })
    assert.deepEqual(hits.slice(0, 2).map(h => h.id), ['12', '11'], `實際前兩名：${hits.slice(0, 2).map(h => h.name).join('、')}`)
  })

  test('篩選：分類、價格上限（含）、只要有供應的', async () => {
    const tea = await searchMenu(es, index, { q: '拿鐵', category: '茶飲' })
    assert.deepEqual(tea.map(h => h.id).sort(), ['24', '27'], `分類「茶飲」裡名稱或描述有拿鐵的是抹茶拿鐵、焙茶拿鐵，實際 ${tea.map(h => h.name).join('、') || '（沒有）'}`)
    const cheap = await searchMenu(es, index, { q: '拿鐵', maxPrice: 120 })
    assert.deepEqual(cheap.map(h => h.id), ['11', '12', '36'], `120 元以下（含 120）：拿鐵 110、冰拿鐵 120，再來是只有描述提到拿鐵的肉桂捲 90；實際 ${cheap.map(h => `${h.name}(${h.id})`).join('、')}`)
    const all = await searchMenu(es, index, { q: '香草拿鐵' })
    assert.equal(all[0]?.id, '16', '沒給 onlyAvailable 時，售完的香草拿鐵（id 16）也要找得到')
    const off = await searchMenu(es, index, { q: '香草拿鐵', onlyAvailable: false })
    assert.equal(off[0]?.id, '16', 'onlyAvailable: false 時不篩供應狀態，售完的香草拿鐵也要找得到')
    const avail = await searchMenu(es, index, { q: '香草拿鐵', onlyAvailable: true })
    assert.ok(avail.length > 0 && !avail.some(h => h.id === '16'), 'onlyAvailable: true 時不能出現 available 是 false 的香草拿鐵')
  })
})
