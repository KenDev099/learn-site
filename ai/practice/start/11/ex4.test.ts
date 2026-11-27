import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { regressionGate, type CaseRuns } from './ex4.ts'

// n 題一般題目，前 pass 題 3 次都過，其他 3 次都不過
const normal = (n: number, pass: number): CaseRuns[] =>
  Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, severity: 'normal' as const, runs: i < pass ? [true, true, true] : [false, false, false] }))

test('剛好下降 3 個百分點：允許', () => {
  const r = regressionGate({ passRate: 0.8, cases: 100 }, normal(100, 77), { maxDropPct: 3 })
  assert.equal(r.passRate, 0.77)
  assert.equal(r.ok, true, '80% → 77% 剛好下降 3 個百分點，「超過」才擋：用 >，不是 >=')
  assert.deepEqual(r.failures, [])
})

test('下降 3.1 個百分點：擋下，原因寫出下降多少', () => {
  const r = regressionGate({ passRate: 0.811, cases: 100 }, normal(100, 78), { maxDropPct: 3 })
  assert.equal(r.ok, false, '81.1% → 78% 下降 3.1 個百分點，超過 3 要擋')
  assert.equal(r.failures.length, 1, 'failures 要列出擋下的原因')
  assert.ok(r.failures[0].includes('下降') && r.failures[0].includes('3.1'), `原因要包含「下降」與百分點 3.1，現在是：${r.failures[0]}`)
})

test('一般題目 3 次中 2 次通過算過，1 次不算', () => {
  const current: CaseRuns[] = [
    { id: 'a', severity: 'normal', runs: [false, true, true] },
    { id: 'b', severity: 'normal', runs: [true, false, true] },
    { id: 'c', severity: 'normal', runs: [true, false, false] },
    { id: 'd', severity: 'normal', runs: [true, true, true] },
  ]
  const r = regressionGate({ passRate: 0.75, cases: 4 }, current, { maxDropPct: 3 })
  assert.equal(r.passRate, 0.75, 'a、b、d 至少 2 次通過算過，c 只有 1 次不算：3 ÷ 4。不能只看第一次的結果')
  assert.equal(r.ok, true)
})

test('critical 題目一次失敗就擋，原因包含題目 id', () => {
  const current: CaseRuns[] = [
    ...normal(9, 9),
    { id: 'refund-rule', severity: 'critical', runs: [true, true, false] },
  ]
  const r = regressionGate({ passRate: 0.9, cases: 10 }, current, { maxDropPct: 3 })
  assert.equal(r.ok, false, 'critical 題目 3 次都要通過：價格、過敏原、退款答錯一次就可能出事')
  assert.equal(r.passRate, 0.9, 'critical 沒通過也算進通過率的分母（9 ÷ 10）')
  assert.equal(r.failures.length, 1, '通過率沒有下降，只有 critical 一個原因')
  assert.ok(r.failures[0].includes('refund-rule'), `原因要包含沒通過的題目 id，現在是：${r.failures[0]}`)
})

test('critical 第一次失敗、後面通過也要擋', () => {
  const current: CaseRuns[] = [...normal(9, 9), { id: 'allergen-croissant', severity: 'critical', runs: [false, true, true] }]
  const r = regressionGate({ passRate: 0.9, cases: 10 }, current, { maxDropPct: 3 })
  assert.equal(r.ok, false, '3 次裡任何一次失敗都要擋，不能只看第一次或最後一次')
})

test('critical 第一次通過、後面失敗也要擋', () => {
  const current: CaseRuns[] = [...normal(9, 9), { id: 'price-latte', severity: 'critical', runs: [true, false, true] }]
  assert.equal(regressionGate({ passRate: 0.9, cases: 10 }, current, { maxDropPct: 3 }).ok, false, '3 次都要看')
})

test('兩個原因同時列出', () => {
  const current: CaseRuns[] = [...normal(9, 5), { id: 'price-latte', severity: 'critical', runs: [true, true, false] }]
  const r = regressionGate({ passRate: 0.9, cases: 10 }, current, { maxDropPct: 3 })
  assert.equal(r.ok, false)
  assert.equal(r.failures.length, 2, `通過率下降 40 個百分點、critical 沒過，兩個原因都要列出，現在是：${JSON.stringify(r.failures)}`)
})

test('題目數跟基準不同：用這次的題數算通過率', () => {
  const r = regressionGate({ passRate: 0.8, cases: 50 }, normal(40, 31), { maxDropPct: 3 })
  assert.equal(r.passRate, 31 / 40, '分母是這次跑的題數 current.length（40），不是基準的 50')
  assert.equal(r.ok, true, '77.5% 比 80% 只下降 2.5 個百分點')
})

test('critical 全部通過、通過率沒變：ok', () => {
  const current: CaseRuns[] = [...normal(9, 8), { id: 'price-latte', severity: 'critical', runs: [true, true, true] }]
  const r = regressionGate({ passRate: 0.9, cases: 10 }, current, { maxDropPct: 3 })
  assert.deepEqual(r, { ok: true, passRate: 0.9, failures: [] })
})

test('兩題 critical 沒過：每題各一個原因', () => {
  const current: CaseRuns[] = [
    ...normal(8, 8),
    { id: 'price-latte', severity: 'critical', runs: [true, false, true] },
    { id: 'refund-rule', severity: 'critical', runs: [true, true, false] },
  ]
  const r = regressionGate({ passRate: 0.8, cases: 10 }, current, { maxDropPct: 3 })
  assert.equal(r.failures.length, 2, `每個沒通過的 critical 題目都要列一個原因，不能只列第一題，現在是：${JSON.stringify(r.failures)}`)
  assert.ok(r.failures.some(f => f.includes('price-latte')) && r.failures.some(f => f.includes('refund-rule')), '兩題的 id 都要出現在原因裡')
})
