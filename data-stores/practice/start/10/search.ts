// 練習 2：菜單搜尋（練習 4 會回來調整這個檔）
// buildQuery(p)：純函式，回傳 es.search 的參數（不含 index），例如 { size, _source, query }
//   q 同時搜 name 與 description，名稱命中要排在只有描述命中的前面
//   category（等於）、maxPrice（小於等於）、onlyAvailable（true 時只要 available 的）是篩選條件，沒給就不篩
//   最多 10 筆；回傳的文件內容只要 name
// searchMenu(es, index, p)：用 buildQuery 查詢，回傳 [{ id, name, score }]，id 是文件的 _id
import type { Client, estypes } from '@elastic/elasticsearch'

export type SearchParams = { q: string; category?: string; maxPrice?: number; onlyAvailable?: boolean }
export type Hit = { id: string; name: string; score: number }

export function buildQuery(p: SearchParams): Omit<estypes.SearchRequest, 'index'> {
  // 寫在這裡
  return {}
}

export async function searchMenu(es: Client, index: string, p: SearchParams): Promise<Hit[]> {
  // 寫在這裡
  return []
}
