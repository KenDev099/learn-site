import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize } from './ex2.ts'
import type { LlmLog, LogStatus } from './ex1.ts'

const near = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}：預期 ${expected}，你的程式算出 ${actual}`)

let n = 0
function log(route: string, latencyMs: number, status: LogStatus = 'ok', t: Partial<LlmLog> = {}): LlmLog {
  return {
    at: new Date(Date.UTC(2026, 10, 1) + n++ * 1000).toISOString(), route, promptVersion: 'v1', model: 'claude-opus-5-5', status,
    latencyMs, ttftMs: null, requestId: `req_${n}`, stopReason: null, refusalCategory: null, errorType: null,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, toolCalls: [], question: 'q', answer: null, ...t,
  }
}

test('依 route 分組，每組各自算', () => {
  const logs = [log('/chat', 100), log('/summary', 5000), log('/chat', 300)]
  const s = summarize(logs)
  assert.deepEqual(Object.keys(s).sort(), ['/chat', '/summary'], '每個 route 一組')
  assert.equal(s['/chat'].count, 2)
  assert.equal(s['/summary'].count, 1)
  assert.deepEqual(summarize([]), {}, '沒有 log 時回傳 {}')
})

test('p95 用 nearest-rank：排序後取第 ceil(0.95 × n) 個', () => {
  // 20 筆：1000、2000、…、20000 打亂順序；ceil(0.95 × 20) = 19 → 第 19 個 = 19000
  const latencies = [7, 19, 3, 20, 1, 15, 11, 2, 18, 9, 5, 13, 17, 4, 6, 8, 10, 12, 14, 16].map(x => x * 1000)
  const logs = latencies.map(ms => log('/chat', ms))
  const s = summarize(logs)
  assert.deepEqual(logs.map(l => l.latencyMs), latencies, '不能改到傳進來的陣列（例如直接 logs.sort）：要排序就先複製一份')
  assert.equal(s['/chat'].p95LatencyMs, 19000, '20 筆時是排序後第 19 個（索引 18）；不是平均（10500），也不是最大值或第 20 個（索引差一）')

  // 21 筆：ceil(0.95 × 21) = 20 → 第 20 個；最慢的一筆是 60000
  const s2 = summarize([...Array.from({ length: 20 }, (_, i) => log('/chat', (i + 1) * 100)), log('/chat', 60000)])
  assert.equal(s2['/chat'].p95LatencyMs, 2000, '21 筆時是第 ceil(19.95) = 20 個，也就是 2000')

  const one = summarize([log('/one', 4321)])
  assert.equal(one['/one'].p95LatencyMs, 4321, '只有 1 筆時 p95 就是那一筆')
})

test('錯誤率、拒答率的分母是全部筆數；費用加總；快取命中率', () => {
  const logs = [
    log('/chat', 1000, 'ok', { inputTokens: 100, cacheReadTokens: 900, costUsd: 0.000580 }),
    log('/chat', 1200, 'ok', { inputTokens: 200, cacheWriteTokens: 800, costUsd: 0.004800 }),
    log('/chat', 900, 'refusal', { inputTokens: 100, cacheReadTokens: 900, costUsd: 0.000400 }),
    log('/chat', 30000, 'error'),
    log('/chat', 400, 'client_aborted'),
  ]
  const s = summarize(logs)['/chat']
  near(s.errorRate, 1 / 5, '錯誤率 = error 的筆數 ÷ 全部筆數（分母不是只算成功的；client_aborted 不算錯誤）')
  near(s.refusalRate, 1 / 5, '拒答率 = refusal 的筆數 ÷ 全部筆數')
  assert.equal(s.costUsd, 0.00578, '費用是 costUsd 的加總，再四捨五入到小數第 6 位（直接相加會得到 0.0057799999999999995 這種浮點誤差）')
  near(s.cacheHitRate, 1800 / 3000, '快取命中率 = cacheRead 加總 ÷（input＋cacheRead＋cacheWrite）加總')
})

test('全部錯誤、完全沒有 token 的路由：比率不能是 NaN', () => {
  const s = summarize([log('/batch', 100, 'error'), log('/batch', 200, 'error')])['/batch']
  assert.equal(s.errorRate, 1, '全部錯誤時錯誤率是 1')
  assert.equal(s.refusalRate, 0)
  assert.equal(s.cacheHitRate, 0, '分母是 0 時快取命中率是 0，不是 NaN')
  assert.equal(s.costUsd, 0)
})
