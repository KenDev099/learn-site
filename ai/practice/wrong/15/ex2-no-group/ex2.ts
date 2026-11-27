// 練習 2：把 log 彙整成每個路由的指標
import type { LlmLog } from './ex1.ts'

export type RouteStats = {
  count: number          // 這個路由有幾筆
  p95LatencyMs: number   // latencyMs 的 p95，nearest-rank：由小到大排序後取第 ceil(0.95 × n) 個（索引 ceil(0.95 × n) - 1）
  costUsd: number        // costUsd 加總，四捨五入到小數第 6 位
  errorRate: number      // status 是 'error' 的筆數 ÷ count
  refusalRate: number    // status 是 'refusal' 的筆數 ÷ count
  cacheHitRate: number   // cacheReadTokens 加總 ÷（inputTokens＋cacheReadTokens＋cacheWriteTokens）加總；分母是 0 時是 0
}

// 依 route 分組，回傳 { [route]: RouteStats }；沒有 log 時回傳 {}
export function summarize(logs: LlmLog[]): Record<string, RouteStats> {
  const all = logs
  const groups = Object.fromEntries(logs.map(l => [l.route, all]))
  const out: Record<string, RouteStats> = {}
  for (const [route, list = []] of Object.entries(groups)) {
    const n = list.length
    const latencies = list.map(l => l.latencyMs).sort((a, b) => a - b)
    const sum = (f: (l: LlmLog) => number) => list.reduce((acc, l) => acc + f(l), 0)
    const prompt = sum(l => l.inputTokens + l.cacheReadTokens + l.cacheWriteTokens)
    out[route] = {
      count: n,
      p95LatencyMs: latencies[Math.ceil(0.95 * n) - 1],
      costUsd: Math.round(sum(l => l.costUsd) * 1e6) / 1e6,
      errorRate: list.filter(l => l.status === 'error').length / n,
      refusalRate: list.filter(l => l.status === 'refusal').length / n,
      cacheHitRate: prompt === 0 ? 0 : sum(l => l.cacheReadTokens) / prompt,
    }
  }
  return out
}
