// 練習 4：跑 eval 套件：每題跑好幾次，用第 11 課的規則評分，收集每次的 usage
import { gradeAnswer, ZERO_USAGE } from './kit.ts'
import type { AssistantOutput, EvalCase, Severity, Usage } from './kit.ts'

// 一個助理：練習 3 的 createAssistant 回傳的就是這個形狀
export type Assistant = { ask(question: string): Promise<AssistantOutput & { usage: Usage }> }
export type CaseReport = {
  id: string
  severity: Severity
  tags: string[]
  passes: number          // 通過的次數
  runs: number            // 跑了幾次
  pass: boolean           // 這題算不算通過
  reasons: string[]       // 沒通過的那幾次的原因（去掉重複）
}
export type EvalReport = {
  cases: CaseReport[]
  passRate: number                // 通過的題數 ÷ 題數
  criticalFailures: string[]      // 沒通過的 critical 題目 id，照 cases 的順序
  usage: Array<{ caseId: string; run: number; usage: Usage }>   // 每一次 ask 的 usage，成本報告（練習 5）用它
}

// 規則：
// - 每題跑 runs 次（run 從 0 開始）；每一次都用 makeAssistant(c.id, run) 建一個新的助理（測試用它換上那一次的回放腳本）
// - 每次的結果用 gradeAnswer 評分；ask 丟錯算這次沒通過，原因寫 `錯誤：${err.message}`，usage 記 ZERO_USAGE，不能讓整個 eval 中斷
// - 一題算通過：critical 每一次都要通過；normal 至少 2/3 的次數通過（passes * 3 >= runs * 2）
// - 題目依序一題一題跑（不要同時跑：真的 API 會被限流）
export async function runEval(makeAssistant: (caseId: string, run: number) => Assistant, cases: EvalCase[], runs = 3): Promise<EvalReport> {
  const report: EvalReport = { cases: [], passRate: 0, criticalFailures: [], usage: [] }
  for (const c of cases) {
    let passes = 0
    const reasons = new Set<string>()
    for (let run = 0; run < runs; run++) {
      try {
        const out = await makeAssistant(c.id, run).ask(c.question)
        report.usage.push({ caseId: c.id, run, usage: out.usage })
        const g = gradeAnswer(c, out)
        if (g.pass) passes++
        else g.reasons.forEach(r => reasons.add(r))
      } catch (err) {
        report.usage.push({ caseId: c.id, run, usage: { ...ZERO_USAGE } })
        reasons.add(`錯誤：${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const pass = passes > 0
    report.cases.push({ id: c.id, severity: c.severity, tags: c.tags, passes, runs, pass, reasons: [...reasons] })
    if (!pass && c.severity === 'critical') report.criticalFailures.push(c.id)
  }
  report.passRate = report.cases.filter(c => c.pass).length / cases.length
  return report
}
