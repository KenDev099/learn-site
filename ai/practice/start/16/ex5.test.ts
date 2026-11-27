import '../../helpers/offline.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Usage } from './kit.ts'
import type { EvalReport } from './ex4.ts'
import { compareModels, costReport, type CostReport } from './ex5.ts'

// 一份小的 eval 報告：4 題 × 2 次。手算的值寫在每個測試裡
const u = (input: number, output: number, write: number, read: number): Usage =>
  ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: write, cache_read_input_tokens: read })
const report = (passRate: number, criticalFailures: string[] = []): EvalReport => ({
  cases: [], passRate, criticalFailures,
  usage: [
    { caseId: 'a', run: 0, usage: u(1000, 200, 0, 4000) },
    { caseId: 'a', run: 1, usage: u(1000, 400, 0, 4000) },
    { caseId: 'b', run: 0, usage: u(5000, 300, 4000, 0) },     // 第一次寫入快取，最貴
    { caseId: 'b', run: 1, usage: u(1000, 300, 0, 4000) },
    { caseId: 'c', run: 0, usage: u(2000, 1000, 0, 0) },       // 輸出長
    { caseId: 'c', run: 1, usage: u(2000, 1000, 0, 0) },
    { caseId: 'd', run: 0, usage: u(500, 120, 0, 0) },
    { caseId: 'd', run: 1, usage: u(500, 120, 0, 0) },
  ],
})

test('Opus 5.5：每次對話費用、快取命中率、最貴 3 題、月費', () => {
  const r = costReport(report(0.96), 'claude-opus-5-5', 500)
  // a0 = (1000×4 + 200×20 + 4000×0.2) / 1e6 = 0.0088；b0 = (5000×4 + 300×20 + 4000×5) / 1e6 = 0.046 …
  assert.equal(r.perConversationUsd, 0.0179, `8 次 ask 的費用加總 0.1432 ÷ 8 = 0.0179（快取讀取 Opus 5.5 是 $0.2／MTok、寫入 $5／MTok：用 kit.ts 的 costOf）；你的是 ${r.perConversationUsd}`)
  assert.equal(r.cacheHitRate, 0.4138, `快取讀取 12,000 ÷ 全部輸入 29,000（input＋寫入＋讀取）= 0.4138；你的是 ${r.cacheHitRate}`)
  assert.deepEqual(r.top3, [{ id: 'b', usd: 0.0284 }, { id: 'c', usd: 0.028 }, { id: 'a', usd: 0.0108 }], '每題的費用是它兩次的平均，取最高的 3 題')
  assert.equal(r.monthlyUsd, 268.5, `0.0179 × 500 則 × 30 天 = 268.5；你的是 ${r.monthlyUsd}`)
  assert.deepEqual([r.model, r.passRate, r.criticalFailures], ['claude-opus-5-5', 0.96, []], 'model、passRate、criticalFailures 照抄')
})

test('Haiku 5.5：同一份 usage 換成 Haiku 的單價', () => {
  const r = costReport(report(0.94), 'claude-haiku-5-5', 1000)
  assert.equal(r.perConversationUsd, 0.000455, `Haiku 5.5 是 $0.1／$0.5，快取寫入 $0.125、讀取 $0.01：加總 0.00364 ÷ 8 = 0.000455；你的是 ${r.perConversationUsd}`)
  assert.equal(r.monthlyUsd, 13.65, '0.000455 × 1000 × 30 = 13.65')
})

test('dailyConversations 與沒有快取的報告', () => {
  const r = costReport({ cases: [], passRate: 1, criticalFailures: [], usage: [{ caseId: 'x', run: 0, usage: u(1000, 100, 0, 0) }] }, 'claude-sonnet-5-5', 1000)
  assert.equal(r.perConversationUsd, 0.003, '(1000×2 + 100×10) / 1e6')
  assert.equal(r.cacheHitRate, 0, '沒有快取讀取時命中率是 0')
  assert.equal(r.monthlyUsd, 90, '0.003 × 1000 × 30 天（一個月算 30 天）')
  assert.deepEqual(r.top3, [{ id: 'x', usd: 0.003 }], '不到 3 題就全部列出')
})

const opus = (): CostReport => costReport(report(0.96), 'claude-opus-5-5', 500)
const haiku = (passRate: number, critical: string[] = []): CostReport => costReport(report(passRate, critical), 'claude-haiku-5-5', 500)

test('品質只降 2.0 個百分點、沒有 critical 失敗：建議換', () => {
  const c = compareModels(opus(), haiku(0.94))
  assert.deepEqual(c, { cheaper: 'claude-haiku-5-5', savingPct: 97.5, qualityDropPct: 2, recommendation: 'switch' },
    '0.96 - 0.94 在浮點數是 0.0200000000000000018：先 round1(… × 100) 再跟 2 比，剛好等於可以換')
})

test('品質降 2.1 個百分點：留在原本的模型', () => {
  const c = compareModels(opus(), haiku(0.939))
  assert.deepEqual([c.qualityDropPct, c.recommendation], [2.1, 'stay'], '超過 MAX_QUALITY_DROP_PCT 就不換，就算便宜 97%')
})

test('便宜而且通過率一樣，但有 critical 失敗：不換', () => {
  const c = compareModels(opus(), haiku(0.96, ['allergen-oat']))
  assert.equal(c.recommendation, 'stay', '過敏原答錯會傷人：候選模型有任何 critical 失敗都不換')
})

test('候選模型比較貴：不換，cheaper 是目前的模型', () => {
  const c = compareModels(haiku(0.94), opus())
  assert.deepEqual([c.cheaper, c.recommendation], ['claude-haiku-5-5', 'stay'])
  assert.ok(c.savingPct < 0, '候選比較貴時 savingPct 是負的')
})
