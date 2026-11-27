// 練習 2：讀懂 explain('executionStats') 的輸出
// 傳進來的是 find(...).explain('executionStats') 或 aggregate(...).explain('executionStats') 的結果
// 回傳：
//   indexes：計畫裡所有 IXSCAN 用到的索引名稱（indexName），不重複、依名稱排序；沒用索引時是 []
//   examinedRatio：totalDocsExamined ÷ nReturned（nReturned 是 0 時當成 1）
//   inMemorySort：計畫裡有沒有 SORT stage
import type { Document } from 'mongodb'

export type Analysis = { indexes: string[]; examinedRatio: number; inMemorySort: boolean }

// 把 stage 樹攤平：一個子節點在 inputStage，多個子節點（例如 OR）在 inputStages
function walk(stage: Document | undefined): Document[] {
  if (!stage) return []
  return [stage, ...walk(stage.inputStage), ...(stage.inputStages ?? []).flatMap(walk)]
}

export function analyze(explain: Document): Analysis {
  const plan = explain.queryPlanner.winningPlan
  // classic 引擎：stage 樹直接在 winningPlan；slot-based 引擎（例如有 $group 的 aggregate）：在 winningPlan.queryPlan
  const stages = walk(plan)
  const indexes = [...new Set(stages.filter(s => s.stage === 'IXSCAN').map(s => s.indexName as string))].sort()
  const { totalDocsExamined, nReturned } = explain.executionStats
  return {
    indexes,
    examinedRatio: totalDocsExamined / Math.max(nReturned, 1),
    inMemorySort: stages.some(s => s.stage === 'SORT'),
  }
}
