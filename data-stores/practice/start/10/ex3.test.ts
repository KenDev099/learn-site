import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import type { Client } from '@elastic/elasticsearch'
import { useEs } from '../../helpers/es.ts'
import { seedMenu } from './menu.ts'
import { searchWithFacets } from './facets.ts'

const es = useEs(10)
const index = 't10-ex3-menu'
before(() => seedMenu(es, index))

// 把 client 包起來，數每一個 API 被呼叫幾次（search、msearch、count…），並記下送出的參數
function counting(calls: string[], args: unknown[] = []): Client {
  return new Proxy(es, {
    get(target, prop) {
      const v = Reflect.get(target, prop)
      if (typeof v !== 'function') return v
      return (...a: unknown[]) => { calls.push(String(prop)); args.push(a[0]); return v.apply(target, a) }
    },
  })
}
const ALL = { 咖啡: 7, 茶飲: 2, 甜點: 2 }

describe('練習 3：分類統計（facet）', { timeout: 30_000 }, () => {
  test('沒選分類：結果與每個分類的筆數', async () => {
    const r = await searchWithFacets(es, index, { q: '拿鐵' })
    assert.equal(r.total, 11, `名稱或描述有「拿鐵」的有 11 筆，total 實際 ${r.total}`)
    assert.equal(r.hits.length, 10, 'hits 最多 10 筆')
    assert.equal(r.hits[0], '11', 'hits 依分數排序，第一名是拿鐵（id 11）')
    assert.deepEqual(r.facets, ALL, `facets 要是每個分類的筆數，實際 ${JSON.stringify(r.facets)}`)
  })

  test('選了「茶飲」：結果只有茶飲，但其他分類的筆數還在', async () => {
    const r = await searchWithFacets(es, index, { q: '拿鐵', category: '茶飲' })
    assert.deepEqual([...r.hits].sort(), ['24', '27'], `選茶飲後結果只有抹茶拿鐵、焙茶拿鐵，實際 ${JSON.stringify(r.hits)}`)
    assert.equal(r.total, 2, 'total 是篩選後的筆數 2')
    assert.deepEqual(r.facets, ALL, `facets 不受選的分類影響，實際 ${JSON.stringify(r.facets)}：分類條件放在 query 裡會讓聚合也只剩茶飲；改用 post_filter（聚合算完才篩 hits）`)
  })

  test('換關鍵字：facets 跟著關鍵字變', async () => {
    const r = await searchWithFacets(es, index, { q: '起司', category: '輕食' })
    assert.deepEqual([...r.hits].sort(), ['37', '41', '47'], `「起司」在輕食裡是火腿起司三明治、起司貝果、起司歐姆蛋，實際 ${JSON.stringify(r.hits)}`)
    assert.deepEqual(r.facets, { 輕食: 3, 甜點: 2 }, `「起司」的分類筆數：輕食 3、甜點 2（起司蛋糕、提拉米蘇），實際 ${JSON.stringify(r.facets)}`)
  })

  test('分類篩選由 Elasticsearch 做：選的分類排在全部結果的 10 名以外也找得到', async () => {
    const r = await searchWithFacets(es, index, { q: '咖啡', category: '甜點' })
    assert.deepEqual([...r.hits].sort(), ['31', '33'], `「咖啡」在甜點裡是巧克力蛋糕、提拉米蘇（提拉米蘇在全部結果排第 14），實際 ${JSON.stringify(r.hits)}：不要先取前 10 筆再用程式篩分類，用 post_filter`)
    assert.equal(r.total, 2, `total 是篩選後的筆數 2，實際 ${r.total}`)
    assert.deepEqual(r.facets, { 咖啡: 10, 甜點: 2, 茶飲: 2 }, `「咖啡」的分類筆數，實際 ${JSON.stringify(r.facets)}`)
  })

  test('結果與統計在同一個請求裡拿到，最多取 10 筆', async () => {
    const calls: string[] = [], args: unknown[] = []
    await searchWithFacets(counting(calls, args), index, { q: '拿鐵', category: '咖啡' })
    assert.deepEqual(calls, ['search'], `只能呼叫一次 es.search，實際呼叫了 ${JSON.stringify(calls)}：hits 與 aggs 可以放在同一個 search 請求`)
    const size = (args[0] as { size?: number }).size
    assert.ok(size === undefined || size <= 10, `search 的 size 最多 10，實際 ${size}：不要多取資料再用程式篩選或截斷`)
  })
})
