// 練習 5：用 eval 實際的 usage 算成本報告，並比較兩個模型
import { costOf } from './kit.ts'
import type { ModelId } from './kit.ts'
import type { EvalReport } from './ex4.ts'

export const DAYS_PER_MONTH = 30
export type CostReport = {
  model: ModelId
  passRate: number                 // 照抄 eval 報告
  criticalFailures: string[]       // 照抄 eval 報告
  perConversationUsd: number       // 平均每次 ask 的費用，四捨五入到小數第 6 位
  cacheHitRate: number             // 快取讀取的 token ÷ 全部輸入 token，四捨五入到小數第 4 位
  top3: Array<{ id: string; usd: number }>   // 平均費用最高的 3 題（每題的費用是它每次 ask 費用的平均，小數第 6 位）
  monthlyUsd: number               // perConversationUsd × dailyConversations × 30，四捨五入到小數第 2 位
}
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

// 規則：
// - 每次 ask 的費用用 kit.ts 的 costOf(usage, model)（四種 token 各用自己的單價，快取讀取不是輸入價）
// - perConversationUsd：所有 ask 費用的總和 ÷ ask 的次數（report.usage.length）
// - cacheHitRate：cache_read 總和 ÷（input＋cache_creation＋cache_read）總和；分母是 0 時是 0
// - top3：依平均費用由高到低，同分依 id 字串順序
// - monthlyUsd：一個月算 DAYS_PER_MONTH（30）天
export function costReport(report: EvalReport, model: ModelId, dailyConversations: number): CostReport {
  const costs = report.usage.map(u => ({ id: u.caseId, usd: costOf(u.usage, model) }))
  const total = costs.reduce((s, c) => s + c.usd, 0)
  const perConversationUsd = round(total / costs.length, 6)
  let read = 0
  let prompt = 0
  for (const { usage: u } of report.usage) {
    read += u.cache_read_input_tokens
    prompt += u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
  }
  const byCase = new Map<string, number[]>()
  for (const c of costs) byCase.set(c.id, [...(byCase.get(c.id) ?? []), c.usd])
  const top3 = [...byCase]
    .map(([id, list]) => ({ id, usd: round(list.reduce((s, x) => s + x, 0) / list.length, 6) }))
    .sort((a, b) => b.usd - a.usd || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 3)
  return {
    model, passRate: report.passRate, criticalFailures: report.criticalFailures,
    perConversationUsd,
    cacheHitRate: prompt === 0 ? 0 : round(read / prompt, 4),
    top3,
    monthlyUsd: round(perConversationUsd * dailyConversations * DAYS_PER_MONTH, 2),
  }
}

export const MAX_QUALITY_DROP_PCT = 2

// 比較目前的模型（current）與想換的模型（candidate）：
// - cheaper：perConversationUsd 比較低的那個 model（一樣時是 current 的）
// - savingPct：round1((1 - candidate ÷ current 的 perConversationUsd) × 100)
// - qualityDropPct：round1((current.passRate - candidate.passRate) × 100)（百分點，先四捨五入再比較，避開浮點誤差）
// - recommendation：candidate 比較便宜、qualityDropPct <= MAX_QUALITY_DROP_PCT、而且 candidate 沒有任何 critical 失敗，才是 'switch'，否則 'stay'
export function compareModels(current: CostReport, candidate: CostReport): {
  cheaper: ModelId; savingPct: number; qualityDropPct: number; recommendation: 'switch' | 'stay'
} {
  const cheaper = candidate.perConversationUsd < current.perConversationUsd ? candidate.model : current.model
  const savingPct = round((1 - candidate.perConversationUsd / current.perConversationUsd) * 100, 1)
  const qualityDropPct = round((current.passRate - candidate.passRate) * 100, 1)
  const ok = cheaper === candidate.model && cheaper !== current.model && qualityDropPct <= MAX_QUALITY_DROP_PCT && candidate.criticalFailures.length === 0
  return { cheaper, savingPct, qualityDropPct, recommendation: ok ? 'switch' : 'stay' }
}
