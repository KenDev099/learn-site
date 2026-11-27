import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { fakeClock } from '../../helpers/clock.ts'
import { sse, textEvents, type SseItem } from '../../helpers/replies.ts'
import { measure } from './ex4.ts'

// 在每個事件之前把時鐘設到指定的時間：times[i] 是第 i 個事件「到達」的時間
function timed(events: SseItem[], times: Record<number, number>, set: (ms: number) => void): SseItem[] {
  return events.flatMap((e, i) => i in times ? [() => set(times[i]), e] : [e])
}

test('TTFT 算到第一個 text delta，不是 message_start 也不是 thinking 開始', async () => {
  const clock = fakeClock(0)
  const events = textEvents(['拿鐵', ' 110 元'], { usage: { output_tokens: 321 } })
  // 0 message_start、1 thinking 開始、2 signature、3 thinking 結束、4 text 開始、5 第一個 text delta、6 第二個、7 block 結束、8 message_delta、9 message_stop
  const { client } = fakeAnthropic([sse(timed(events, { 0: 100, 1: 300, 4: 850, 5: 900, 6: 1500, 9: 2000 }, clock.set))])
  const result = await measure(client, '拿鐵多少？', clock.now)
  assert.equal(result.ttftMs, 900, 'TTFT 要算到第一個 text delta（900ms）：message_start 在 100ms、thinking 在 300ms 開始，那時使用者還看不到任何字')
  assert.equal(result.totalMs, 2000, 'totalMs 要算到串流結束（finalMessage 完成）')
  assert.equal(result.outputTokens, 321, 'outputTokens 要用最終的 usage（message_delta 帶來的），不是 message_start 的')
})

test('換一組時間也對：用傳入的 now()，從送出請求前開始算', async () => {
  const clock = fakeClock(5000)
  const events = textEvents(['週一', '到週五', ' 07:00 開門'], { usage: { output_tokens: 88 } })
  const { client } = fakeAnthropic([sse(timed(events, { 0: 5040, 1: 5200, 5: 6234, 7: 6400, 10: 7500 }, clock.set))])
  const result = await measure(client, '幾點開門？', clock.now)
  assert.deepEqual(result, { ttftMs: 1234, totalMs: 2500, outputTokens: 88 }, '時間要用參數 now()（不要用 Date.now），起點是送出請求前的 now()')
})

test('整個回應沒有文字時 ttftMs 是 null', async () => {
  const clock = fakeClock(0)
  const { client } = fakeAnthropic([sse(timed(textEvents([]), { 0: 100, 6: 700 }, clock.set))])
  const result = await measure(client, '…', clock.now)
  assert.equal(result.ttftMs, null, '沒有任何 text delta 時，ttftMs 要是 null，不能用總時間或 0 代替')
  assert.equal(result.totalMs, 700)
})
