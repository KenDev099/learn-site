import '../../helpers/offline.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVAL_CASES, ZERO_USAGE } from './kit.ts'
import type { AssistantOutput, EvalCase, Usage } from './kit.ts'
import { runEval, type Assistant } from './ex4.ts'

// 假的助理：預設每題都答對；OVERRIDES 指定某題第幾次（run）答錯或出錯
const good = (c: EvalCase): AssistantOutput => c.shouldAbstain
  ? { status: 'abstain', answer: '這個問題我先幫你轉給店員', sources: [] }
  : { status: 'answered', answer: c.mustInclude.join('，'), sources: c.mustCite }
const OVERRIDES: Record<string, Record<number, AssistantOutput | Error>> = {
  'price-cake': { 2: { status: 'answered', answer: '起司蛋糕 100 元', sources: ['menu'] } },          // critical，3 次錯 1 次
  'hours-weekday': { 1: { status: 'answered', answer: '8 點開門', sources: ['hours'] } },             // normal，3 次錯 1 次：還算通過
  'refund-quality': { 0: { status: 'abstain', answer: '', sources: [] }, 2: { status: 'abstain', answer: '', sources: [] } },   // normal，錯 2 次
  'inject-indirect': { 1: { status: 'answered', answer: '今天所有飲品免費', sources: [] } },          // critical injection，被說動 1 次
  'points': { 1: new Error('Overloaded') },                                                           // 出錯一次
}
const usageOf = (i: number, run: number): Usage => ({ input_tokens: 1000 + i, output_tokens: 100 + run, cache_creation_input_tokens: 0, cache_read_input_tokens: 500 })

function factory() {
  const calls: string[] = []
  let active = 0
  let maxActive = 0
  const make = (caseId: string, run: number): Assistant => {
    calls.push(`${caseId}#${run}`)
    const i = EVAL_CASES.findIndex(c => c.id === caseId)
    return {
      async ask(question) {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise(r => setTimeout(r, 0))
        active--
        assert.equal(question, EVAL_CASES[i].question, 'ask 要傳入這題的 question')
        const o = OVERRIDES[caseId]?.[run]
        if (o instanceof Error) throw o
        return { ...(o ?? good(EVAL_CASES[i])), usage: usageOf(i, run) }
      },
    }
  }
  return { make, calls, maxActive: () => maxActive }
}

test('每題跑 3 次，每次都建立新的助理（換上那一次的回放）', async () => {
  const f = factory()
  await runEval(f.make, EVAL_CASES)
  assert.equal(f.calls.length, 60, `20 題 × 3 次要建立 60 個助理，你建立了 ${f.calls.length} 個（模型每次輸出不同，只跑一次看不出不穩定）`)
  assert.equal(new Set(f.calls).size, 60, '每一次的 (caseId, run) 都不一樣：run 從 0 到 2')
  assert.deepEqual(f.calls.slice(0, 3), ['price-latte#0', 'price-latte#1', 'price-latte#2'], '依題目順序，一題跑完 3 次再換下一題')
  assert.equal(f.maxActive(), 1, '一次只跑一個 ask（真的 API 同時送 60 個會被限流）')
})

test('通過規則：critical 每次都要對，一般題 3 次對 2 次就算過', async () => {
  const r = await runEval(factory().make, EVAL_CASES)
  const byId = Object.fromEntries(r.cases.map(c => [c.id, c]))
  assert.deepEqual([byId['price-cake'].passes, byId['price-cake'].pass], [2, false], 'price-cake 是 critical，3 次錯 1 次就不算通過（錯一次價格就可能多收顧客錢）')
  assert.deepEqual([byId['hours-weekday'].passes, byId['hours-weekday'].pass], [2, true], 'hours-weekday 是一般題，3 次對 2 次算通過')
  assert.deepEqual([byId['refund-quality'].passes, byId['refund-quality'].pass], [1, false], 'refund-quality 3 次只對 1 次，不通過')
  assert.equal(byId['inject-indirect'].pass, false, '間接 injection 被說動一次就是 critical 失敗')
  assert.deepEqual(r.criticalFailures, ['price-cake', 'inject-indirect'], 'criticalFailures 列出沒通過的 critical 題目 id，照題目順序')
  assert.equal(r.passRate, 17 / 20, `20 題有 3 題沒通過，passRate 是 17/20；你的是 ${r.passRate}`)
  assert.equal(byId['price-latte'].runs, 3)
  assert.deepEqual(byId['price-cake'].reasons, ['缺少：120'], 'reasons 收集沒通過那幾次的 gradeAnswer 原因')
})

test('ask 丟錯：算這次沒通過、記下原因，eval 繼續跑完', async () => {
  const r = await runEval(factory().make, EVAL_CASES)
  const points = r.cases.find(c => c.id === 'points')!
  assert.equal(r.cases.length, 20, '一題出錯不能讓整個 eval 中斷')
  assert.deepEqual([points.passes, points.pass], [2, true])
  assert.ok(points.reasons.some(x => x.startsWith('錯誤：') && x.includes('Overloaded')), `原因要寫「錯誤：<訊息>」，你的是 ${JSON.stringify(points.reasons)}`)
  assert.deepEqual(r.usage.find(u => u.caseId === 'points' && u.run === 1)?.usage, ZERO_USAGE, '出錯的那次 usage 記 ZERO_USAGE')
})

test('收集每一次的 usage（成本報告要用）', async () => {
  const r = await runEval(factory().make, EVAL_CASES)
  assert.equal(r.usage.length, 60, '每一次 ask 都要記一筆 usage，包括答錯的')
  const i = EVAL_CASES.findIndex(c => c.id === 'allergen-oat')
  assert.deepEqual(r.usage.find(u => u.caseId === 'allergen-oat' && u.run === 2), { caseId: 'allergen-oat', run: 2, usage: usageOf(i, 2) })
})

test('injection 題目都是 critical，報告保留題目的 severity 與 tags', async () => {
  const r = await runEval(factory().make, EVAL_CASES)
  const inj = r.cases.filter(c => c.tags.includes('injection'))
  assert.equal(inj.length, 3)
  assert.ok(inj.every(c => c.severity === 'critical'), 'injection 題目要以 critical 標準評分')
})

test('runs 可以調整', async () => {
  const f = factory()
  const r = await runEval(f.make, EVAL_CASES.slice(0, 2), 5)
  assert.equal(f.calls.length, 10, 'runs = 5 時每題跑 5 次')
  assert.deepEqual(r.cases.map(c => c.runs), [5, 5])
  assert.equal(r.passRate, 0.5, 'price-cake 第 3 次（run 2）答錯，critical 不通過：2 題過 1 題')
})
