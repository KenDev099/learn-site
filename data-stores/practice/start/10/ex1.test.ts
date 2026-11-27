import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useEs } from '../../helpers/es.ts'
import { createMenuIndex } from './mapping.ts'

const es = useEs(10)
const index = 't10-ex1-menu'

async function props(name: string) {
  const m = await es.indices.getMapping({ index: name })
  return m[name]!.mappings
}
const tokens = async (field: string, text: string) =>
  (await es.indices.analyze({ index, field, text })).tokens!.map(t => t.token)

describe('練習 1：菜單索引的 mapping', { timeout: 30_000 }, () => {
  test('建立索引，欄位型別正確', async () => {
    await createMenuIndex(es, index)
    assert.ok(await es.indices.exists({ index }), `createMenuIndex 要建立名為 ${index} 的索引（用參數 index，不要寫死名稱）`)
    const p = (await props(index)).properties ?? {}
    assert.equal(p.name?.type, 'text', 'name 要用 text：要分詞才能全文搜尋')
    assert.equal(p.description?.type, 'text', 'description 要用 text')
    assert.equal(p.category?.type, 'keyword', 'category 要用 keyword：整個值當一個詞，才能精確篩選與做 terms 聚合；text 會被切成 bigram')
    assert.equal(p.price?.type, 'integer', `price 要用 integer（新台幣元沒有小數），實際是 ${p.price?.type}；float 會有二進位誤差`)
    assert.equal(p.sales?.type, 'integer', 'sales 要用 integer')
    assert.equal(p.available?.type, 'boolean', 'available 要用 boolean')
  })

  test('name 有 keyword 子欄位 name.keyword', async () => {
    const p = (await props(index)).properties ?? {}
    const sub = (p.name as { fields?: Record<string, { type?: string }> }).fields?.keyword
    assert.equal(sub?.type, 'keyword', 'name 要用 fields 加一個 keyword 子欄位（multi-field），排序、精確比對、聚合用 name.keyword')
  })

  test('中文欄位用 cjk 分析器：「焦糖拿鐵」切出「拿鐵」，不會有單獨的「鐵」', async () => {
    for (const field of ['name', 'description']) {
      const t = await tokens(field, '焦糖拿鐵')
      assert.ok(t.includes('拿鐵'), `${field} 分析「焦糖拿鐵」得到 ${JSON.stringify(t)}：要用 cjk 分析器（bigram），才會有「拿鐵」這個詞`)
      assert.ok(!t.includes('鐵'), `${field} 分析「焦糖拿鐵」得到 ${JSON.stringify(t)}：standard 分析器一個字一個詞，搜「鐵」也會找到拿鐵`)
    }
  })

  test('寫入文件後：搜「拿鐵」找得到，搜「鐵」找不到；category 可以精確篩選與統計', async () => {
    await es.index({ index, id: '14', document: { name: '焦糖拿鐵', description: '自製焦糖醬', category: '咖啡', price: 130, available: true, sales: 260 } })
    await es.index({ index, id: '22', document: { name: '伯爵紅茶', description: '佛手柑香氣', category: '茶飲', price: 90, available: true, sales: 200 }, refresh: 'wait_for' })
    const hit = await es.search({ index, query: { match: { name: '拿鐵' } } })
    assert.deepEqual(hit.hits.hits.map(h => h._id), ['14'], '搜「拿鐵」要找到焦糖拿鐵')
    const iron = await es.search({ index, query: { match: { name: '鐵' } } })
    assert.equal(iron.hits.hits.length, 0, '搜「鐵」不應該找到拿鐵：name 要用 cjk 分析器')
    const coffee = await es.search({ index, query: { bool: { filter: [{ term: { category: '咖啡' } }] } }, aggs: { c: { terms: { field: 'category' } } } })
    assert.deepEqual(coffee.hits.hits.map(h => h._id), ['14'], 'term: { category: "咖啡" } 要剛好找到咖啡')
  })

  test('寫入 mapping 以外的欄位會被拒絕（dynamic: strict）', async () => {
    await assert.rejects(
      es.index({ index, id: '99', document: { name: '測試', description: '', category: '咖啡', price: 1, available: true, sales: 0, colour: 'brown' } }),
      /strict_dynamic_mapping_exception/,
      '多出 colour 欄位的文件要寫入失敗：mappings 要設 dynamic: "strict"，否則第一筆資料就會自動決定新欄位的型別')
    assert.equal((await props(index)).dynamic, 'strict', 'mappings.dynamic 要是 "strict"')
  })

  test('用參數的索引名稱：換一個名稱也能建立', async () => {
    await createMenuIndex(es, 't10-ex1-other')
    const p = (await props('t10-ex1-other')).properties ?? {}
    assert.equal(p.category?.type, 'keyword', '用另一個名稱建立的索引也要有同樣的 mapping')
  })
})
