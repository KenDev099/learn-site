// 練習 2：讀懂 explain('executionStats') 的輸出
// 傳進來的是 find(...).explain('executionStats') 或 aggregate(...).explain('executionStats') 的結果
// 回傳：
//   indexes：計畫裡所有 IXSCAN 用到的索引名稱（indexName），不重複、依名稱排序；沒用索引時是 []
//   examinedRatio：totalDocsExamined ÷ nReturned（nReturned 是 0 時當成 1）
//   inMemorySort：計畫裡有沒有 SORT stage
import type { Document } from 'mongodb'

export type Analysis = { indexes: string[]; examinedRatio: number; inMemorySort: boolean }

export function analyze(explain: Document): Analysis {
  // 寫在這裡
  return { indexes: [], examinedRatio: 0, inMemorySort: false }
}
