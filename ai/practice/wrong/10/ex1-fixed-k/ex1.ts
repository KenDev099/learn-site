// 練習 1：RRF（reciprocal rank fusion）：用名次合併好幾個排名
export type Fused = { id: string; score: number }

// rankings：每個元素是一路檢索的結果（id 依相關程度由高到低），例如 [向量的前 20 名, 關鍵字的前 20 名]
// 每份資料的分數 = 它出現的每一路的 1 / (k + 名次) 加總；第 1 名的名次是 1
// 同一路裡重複出現的 id 只算第一次（名次最前的那次）
// 回傳分數由高到低；同分時依 id 的字串順序（a.id < b.id 的排前面）
export function rrf(rankings: string[][], k = 60): Fused[] {
  const scores = new Map<string, number>()
  for (const list of rankings) {
    const seen = new Set<string>()
    list.forEach((id, i) => {
      if (seen.has(id)) return
      seen.add(id)
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + i + 1))   // i 從 0 開始，名次是 i + 1
    })
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
