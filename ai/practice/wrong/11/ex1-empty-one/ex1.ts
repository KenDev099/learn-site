// 練習 1：檢索的指標 recall@k 與 MRR
// 每一題：retrieved 是檢索回傳的資料 id（依名次排好，第 1 名在最前面），relevant 是人工標記「應該找到」的 id
export type RetrievalResult = { retrieved: string[]; relevant: string[] }
export type RetrievalMetrics = { recallAtK: number; mrr: number }

// recall@k：每一題「前 k 名裡找到的相關 id 數 ÷ 相關 id 總數」，再對題目取平均
// MRR：每一題「整個 retrieved 裡第一個相關結果的名次」的倒數（名次從 1 開始；完全沒找到算 0），再對題目取平均
// relevant 是空陣列的題目（例如超出範圍、應該拒答的問題）兩個指標都不計入，分母也不算它
// 沒有任何可以計算的題目時丟出 Error
export function retrievalMetrics(results: RetrievalResult[], k: number): RetrievalMetrics {
  const scored = results
  if (scored.length === 0) throw new Error('沒有可以計算的題目：每一題的 relevant 都是空的')
  let recall = 0
  let rr = 0
  for (const { retrieved, relevant } of scored) {
    const top = retrieved.slice(0, k)
    if (relevant.length === 0) { recall += 1; rr += 1; continue }
    recall += relevant.filter(id => top.includes(id)).length / relevant.length
    const i = retrieved.findIndex(id => relevant.includes(id))
    rr += i === -1 ? 0 : 1 / (i + 1)          // 名次從 1 開始
  }
  return { recallAtK: recall / scored.length, mrr: rr / scored.length }
}
