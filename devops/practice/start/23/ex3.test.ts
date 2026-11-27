// 練習 3：請求期間的每一行 log 都帶著自己那個請求的 trace_id 與 span_id，請求以外的 log 不帶
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hex, order, startStack } from './testkit.ts'

const dir = import.meta.dirname

test('同時 20 個請求：兩個服務的每一行請求 log 都帶著自己那個請求的 trace_id 與 span_id', async () => {
  const stack = await startStack(dir)
  const reqs = Array.from({ length: 20 }, () => ({ requestId: `req-${hex(6)}`, traceId: hex(16) }))
  try {
    const responses = await Promise.all(reqs.map(r => order(stack.api, `00-${r.traceId}-${hex(8)}-01`, r.requestId)))
    for (const res of responses) await res.text()
  } finally {
    await stack.stop()
  }
  const spans = stack.collector.spans
  assert.equal(spans.length, 60, `接收器應該收到 60 個 span，實際是 ${spans.length} 個：先完成練習 2`)
  for (const [svc, want] of [[stack.api, ['order received', 'kitchen accepted', 'request']], [stack.kitchen, ['ticket received', 'ticket printed']]] as const) {
    const lines = svc.lines().filter(l => l.request_id)
    const service = lines[0]?.service
    for (const r of reqs) {
      const mine = lines.filter(l => l.request_id === r.requestId)
      assert.deepEqual(mine.map(l => l.msg).sort(), [...want].sort(), `${service} 對請求 ${r.requestId} 應該印出 ${want.join('、')}`)
      for (const l of mine) {
        assert.equal(l.trace_id, r.traceId, `${service} 的「${l.msg}」那一行 trace_id 應該是 ${r.traceId}，實際是 ${l.trace_id ?? '（沒有）'}：在 logger.ts 用 pino 的 mixin 從 trace.getActiveSpan() 讀，不要用全域變數，也不要只在 api 從標頭讀`)
        const own = spans.filter(s => s.traceId === r.traceId && s.service === service).map(s => s.spanId)
        assert.ok(own.includes(l.span_id), `${service} 的「${l.msg}」那一行 span_id（${l.span_id ?? '沒有'}）應該是這個服務在這個請求裡的 span 之一（${own.join('、')}）：用 span.spanContext().spanId`)
      }
    }
  }
})

test('啟動訊息這種請求以外的 log 不帶 trace_id、span_id', async () => {
  const stack = await startStack(dir)
  await stack.stop()
  for (const svc of [stack.api, stack.kitchen]) {
    const listening = svc.lines().find(l => l.msg === 'listening')
    assert.ok(listening, `找不到 listening 那一行：\n${svc.output().slice(-800)}`)
    assert.ok(!('trace_id' in listening) && !('span_id' in listening), `${listening.service} 的 listening 那一行不應該有 trace_id、span_id：沒有 active span 時 mixin 要回傳 {}`)
  }
})
