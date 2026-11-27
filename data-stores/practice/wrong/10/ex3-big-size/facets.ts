// 練習 3：搜尋結果加上分類統計（facet）
// searchWithFacets(es, index, { q, category? })，只能呼叫一次 es.search
//   hits：符合 q（name 或 description）且符合 category 的商品 id，最多 10 筆，依分數排序
//   total：符合 q 與 category 的總筆數
//   facets：符合 q 的商品在每個分類各有幾筆，例如 { 咖啡: 7, 茶飲: 2, 甜點: 2 }。不受 category 影響：
//           使用者點了「茶飲」之後，其他分類的數字還是要看得到，才能切換
import type { Client } from '@elastic/elasticsearch'

export type FacetParams = { q: string; category?: string }
export type FacetResult = { hits: string[]; total: number; facets: Record<string, number> }

export async function searchWithFacets(es: Client, index: string, p: FacetParams): Promise<FacetResult> {
  const r = await es.search<unknown, { categories: { buckets: { key: string; doc_count: number }[] } }>({
    index,
    size: 100,
    query: { multi_match: { query: p.q, fields: ['name^3', 'description'] } },
    // 錯：沒有 post_filter，取回結果後才用程式篩分類
    aggs: { categories: { terms: { field: 'category' } } },
    _source: ['category'],
  })
  const total = r.hits.total
  return {
    hits: r.hits.hits.filter(h => p.category === undefined || (h._source as { category: string }).category === p.category).map(h => h._id!).slice(0, 10),
    total: p.category === undefined ? (typeof total === 'number' ? total : total!.value) : (r.aggregations!.categories.buckets.find(b => b.key === p.category)?.doc_count ?? 0),
    facets: Object.fromEntries(r.aggregations!.categories.buckets.map(b => [b.key, b.doc_count])),
  }
}
