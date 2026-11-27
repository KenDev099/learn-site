import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { choose, NEEDS, type Plan, type ReportNeed } from './choose.ts'

const M = 1_000_000
const cases: [ReportNeed, Plan, string][] = [
  [{ name: '索引剛好縮到 10,000 列', rowsScanned: 90 * M, rowsAfterIndex: 10_000, maxStaleSeconds: 86_400, fixedQuery: false }, 'postgres-index', '規則 1 是 ≤ 10,000：剛好 10,000 列也算'],
  [{ name: '索引縮到 10,001 列、要即時', rowsScanned: 3 * M, rowsAfterIndex: 10_001, maxStaleSeconds: 0, fixedQuery: true }, 'read-replica', '超過 10,000 列、又要即時：規則 2'],
  [{ name: '要 59 分 59 秒內的資料、量很大', rowsScanned: 200 * M, rowsAfterIndex: 200 * M, maxStaleSeconds: 3_599, fixedQuery: true }, 'read-replica', '3,599 < 3,600 要比 1 小時新：每晚的 ETL 太舊，就算量很大也不能選 olap（規則 2 在規則 3 前面）'],
  [{ name: '可以落後剛好 1 小時的固定報表', rowsScanned: 5 * M, rowsAfterIndex: 5 * M, maxStaleSeconds: 3_600, fixedQuery: true }, 'materialized-view', '3,600 不小於 3,600，規則 2 不成立；量不到 5,000 萬、固定查詢：規則 4'],
  [{ name: '剛好 5,000 萬列的臨時分析', rowsScanned: 50 * M, rowsAfterIndex: 50 * M, maxStaleSeconds: 86_400, fixedQuery: false }, 'olap', '規則 3 是 ≥ 50,000,000：剛好 5,000 萬也算'],
  [{ name: '49,999,999 列的固定報表', rowsScanned: 50 * M - 1, rowsAfterIndex: 50 * M - 1, maxStaleSeconds: 86_400, fixedQuery: true }, 'materialized-view', '不到 5,000 萬：規則 4'],
  [{ name: '49,999,999 列的臨時查詢', rowsScanned: 50 * M - 1, rowsAfterIndex: 50 * M - 1, maxStaleSeconds: 86_400, fixedQuery: false }, 'read-replica', '不到 5,000 萬、不是固定查詢：規則 5'],
  [{ name: '量大的固定儀表板，每天看一次', rowsScanned: 120 * M, rowsAfterIndex: 120 * M, maxStaleSeconds: 86_400, fixedQuery: true }, 'olap', '量大且可以接受隔天的資料：規則 3 在規則 4 前面'],
  [{ name: '小量但臨時的查詢', rowsScanned: 300_000, rowsAfterIndex: 300_000, maxStaleSeconds: 7_200, fixedQuery: false }, 'read-replica', '規則 5'],
  [{ name: '有好索引的即時查詢', rowsScanned: 30 * M, rowsAfterIndex: 12, maxStaleSeconds: 0, fixedQuery: false }, 'postgres-index', '規則 1 最優先'],
]

describe('練習 4：替報表需求選方案', { timeout: 30_000 }, () => {
  test('咖啡店的五個需求', () => {
    const want: Plan[] = ['postgres-index', 'read-replica', 'materialized-view', 'olap', 'read-replica']
    NEEDS.forEach((need, i) => assert.equal(choose(need), want[i], `「${need.name}」應該是 ${want[i]}，實際 ${choose(need)}`))
  })

  test('另外 10 組情境（含邊界值）', () => {
    for (const [need, want, why] of cases) {
      assert.equal(choose(need), want, `「${need.name}」應該是 ${want}，實際 ${choose(need)}：${why}`)
    }
  })
})
