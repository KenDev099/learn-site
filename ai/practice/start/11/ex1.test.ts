import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { retrievalMetrics, type RetrievalResult } from './ex1.ts'

const close = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}（算出 ${actual}，應該是 ${expected}）`)

// 課文裡手算過的 4 題
const FOUR: RetrievalResult[] = [
  { retrieved: ['menu-1', 'hours-1', 'menu-2'], relevant: ['menu-1'] },
  { retrieved: ['hours-1', 'membership-2', 'membership-1', 'faq-1'], relevant: ['membership-1', 'membership-3'] },
  { retrieved: ['faq-1', 'hours-2', 'hours-1'], relevant: ['hours-1', 'hours-2'] },
  { retrieved: ['menu-2', 'faq-1', 'hours-1', 'menu-3'], relevant: ['menu-3'] },
]

test('recall@3：每題「找到的相關數 ÷ 相關總數」的平均', () => {
  close(retrievalMetrics(FOUR, 3).recallAtK, (1 + 0.5 + 1 + 0) / 4,
    'recall@k 要看每題找到幾個相關的、除以這題的相關總數（第 2 題只找到 2 個中的 1 個，是 0.5），不是「有找到就算 1」')
})

test('MRR：第一個相關結果名次的倒數（名次從 1 開始，看整個 retrieved），再平均', () => {
  close(retrievalMetrics(FOUR, 3).mrr, (1 + 1 / 3 + 1 / 2 + 1 / 4) / 4,
    'MRR 每題是 1 ÷ 第一個相關結果的名次：第 1 名是 1、第 3 名是 1/3；名次從 1 開始，而且要往後找，不是只看第 1 名')
})

test('只有一題：第 1 名就是相關的，MRR 是 1', () => {
  const r = retrievalMetrics([{ retrieved: ['a', 'b'], relevant: ['a'] }], 1)
  close(r.mrr, 1, '第 1 名就相關時倒數是 1/1，名次要從 1 開始算')
  close(r.recallAtK, 1, '相關的 a 在前 1 名裡，recall@1 是 1')
})

test('完全沒找到的題目：MRR 算 0、recall 算 0', () => {
  const r = retrievalMetrics([{ retrieved: ['a', 'b'], relevant: ['z'] }, { retrieved: ['z'], relevant: ['z'] }], 5)
  close(r.mrr, 0.5, '找不到的題目倒數算 0，另一題是 1，平均 0.5')
  close(r.recallAtK, 0.5, '找不到的題目 recall 是 0')
})

test('relevant 是空陣列的題目不計入（不是算 0 也不是算 1）', () => {
  const withEmpty = [...FOUR, { retrieved: ['faq-1', 'menu-1'], relevant: [] }, { retrieved: [], relevant: [] }]
  const r = retrievalMetrics(withEmpty, 3)
  close(r.recallAtK, 0.625, '沒有相關資料的題目（例如應該拒答的問題）不能放進分母，也不能算成 0 或 1')
  close(r.mrr, (1 + 1 / 3 + 1 / 2 + 1 / 4) / 4, 'MRR 也一樣：relevant 是空的題目不計入')
})

test('k 比 retrieved 長：整份都算前 k 名', () => {
  close(retrievalMetrics(FOUR, 10).recallAtK, (1 + 0.5 + 1 + 1) / 4, 'k = 10 時第 4 題的 menu-3（第 4 名）也算找到')
})

test('k 會影響 recall：前 1 名', () => {
  close(retrievalMetrics(FOUR, 1).recallAtK, (1 + 0 + 0 + 0) / 4, 'k = 1 只看第 1 名')
})

test('沒有任何可以計算的題目時丟錯', () => {
  assert.throws(() => retrievalMetrics([{ retrieved: ['a'], relevant: [] }], 3), Error, '全部題目都沒有 relevant 時，平均沒有意義，要丟出 Error（不要回傳 NaN）')
})
