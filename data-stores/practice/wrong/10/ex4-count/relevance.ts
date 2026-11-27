// 練習 4：用固定的案例評估搜尋品質
// cases.json：[{ "q": "搜尋字", "expect": "期望排第一的商品 id" }, …]，至少 6 組，q 不重複；id 對照 menu.ts（10～49）
// evaluate(es, index, cases)：每一組用 search.ts 的 searchMenu(es, index, { q }) 查詢，
//   回傳 Precision@1 = 第一名就是 expect 的組數 ÷ 總組數（0～1）
import type { Client } from '@elastic/elasticsearch'
import { searchMenu } from './search.ts'

export type Case = { q: string; expect: string }

export async function evaluate(es: Client, index: string, cases: Case[]): Promise<number> {
  let hit = 0
  for (const c of cases) {
    const [first] = await searchMenu(es, index, { q: c.q })
    if (first?.id === c.expect) hit++
  }
  return hit
}
