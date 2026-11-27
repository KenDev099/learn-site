// 練習 2：菜單搜尋（練習 4 會回來調整這個檔）
// buildQuery：組出 es.search 的參數（不含 index），純函式
// searchMenu：用 buildQuery 查詢，回傳前 10 筆 { id, name, score }
import type { Client, estypes } from '@elastic/elasticsearch'

export type SearchParams = { q: string; category?: string; maxPrice?: number; onlyAvailable?: boolean }
export type Hit = { id: string; name: string; score: number }

export function buildQuery(p: SearchParams): Omit<estypes.SearchRequest, 'index'> {
  const filter: estypes.QueryDslQueryContainer[] = []
  if (p.category !== undefined) filter.push({ term: { category: p.category } })
  if (p.maxPrice !== undefined) filter.push({ range: { price: { lte: p.maxPrice } } })
  if (p.onlyAvailable) filter.push({ term: { available: true } })
  return {
    size: 10,
    _source: ['name'],
    query: {
      function_score: {
        query: {
          bool: {
            must: [{ multi_match: { query: p.q, fields: ['name^3', 'description'] } }, ...filter],
          },
        },
        // 分數加上 log(1 + 銷量)：相關性差不多時，賣得好的排前面
        functions: [{ field_value_factor: { field: 'sales', modifier: 'log1p', missing: 0 } }],
        boost_mode: 'sum',
      },
    },
  }
}

export async function searchMenu(es: Client, index: string, p: SearchParams): Promise<Hit[]> {
  const r = await es.search<{ name: string }>({ index, ...buildQuery(p) })
  return r.hits.hits.map(h => ({ id: h._id!, name: h._source!.name, score: h._score! }))
}
