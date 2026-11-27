// 練習 4：CI 的回歸門檻
import type { Severity } from './ex2.ts'

// main 分支上一次完整跑完的結果（基準）：passRate 是 0～1
export type RunSummary = { passRate: number; cases: number }
// 這次 PR 的結果：每一題跑 3 次，runs 是每次有沒有通過
export type CaseRuns = { id: string; severity: Severity; runs: boolean[] }
export type GateResult = { ok: boolean; passRate: number; failures: string[] }

// 已經寫好，不用改：四捨五入到小數 1 位（0.8 - 0.77 在浮點數是 0.030000000000000027，換成百分點要先處理）
export const round1 = (n: number) => Math.round(n * 10) / 10

// 一題算通過：一般題目 3 次中至少 2 次通過；severity 是 critical 的題目 3 次都要通過
// passRate：通過的題數 ÷ 這次的題數（current.length，不是基準的題數）
// 擋下 PR（ok 為 false）的條件，兩個都要檢查，原因全部放進 failures：
//   通過率比基準下降「超過」maxDropPct 個百分點（剛好等於不擋）；
//     百分點 = round1((baseline.passRate - passRate) * 100)，原因要包含「下降」與這個數字
//   任何 critical 題目沒通過；每一題一個原因，要包含題目的 id
// 沒有任何原因時 ok 為 true、failures 是空陣列
export function regressionGate(baseline: RunSummary, current: CaseRuns[], opts: { maxDropPct: number }): GateResult {
  if (current.length === 0) throw new Error('這次沒有跑任何題目')
  const failures: string[] = []
  let passed = 0
  for (const c of current) {
    const n = c.runs.filter(Boolean).length
    const ok = c.severity === 'critical' ? n === c.runs.length : n >= 2
    if (ok) passed++
    else if (c.severity === 'critical') failures.push(`critical 案例 ${c.id} 沒有每次都通過（${n}/${c.runs.length}）`)
  }
  const passRate = passed / current.length
  const drop = (baseline.passRate - passRate) * 100
  if (drop > opts.maxDropPct) failures.push(`通過率下降 ${drop} 個百分點（基準 ${round1(baseline.passRate * 100)}%，這次 ${round1(passRate * 100)}%），超過 ${opts.maxDropPct}`)
  return { ok: failures.length === 0, passRate, failures }
}
