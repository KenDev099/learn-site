// 練習 2：api 與 kitchen 的 span 串成同一條 trace，透過 OTLP/HTTP 送出，關機時一個都不少
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hex, order, startStack, type Span } from './testkit.ts'

const dir = import.meta.dirname

const show = (spans: Span[]) => spans.map(s => `  ${s.service} ${s.kind} "${s.name}" trace=${s.traceId} span=${s.spanId} parent=${s.parentSpanId || '（無）'}`).join('\n') || '  （一個都沒有）'

// 送一個帶 traceparent 的訂單，停掉服務，回傳收到的 span
async function one(kitchenEnv: Record<string, string> = {}, path = '/orders') {
  const traceId = hex(16), parentId = hex(8)
  const stack = await startStack(dir, kitchenEnv)
  let status = 0
  try {
    const res = await order(stack.api, `00-${traceId}-${parentId}-01`, `req-${hex(4)}`, path)
    status = res.status
    await res.text()
  } finally {
    await stack.stop()
  }
  const spans = stack.collector.spans
  assert.ok(spans.length > 0, `接收器一個 span 都沒收到。檢查 tracing.ts：TracerProvider 要有 BatchSpanProcessor + OTLPTraceExporter 並註冊成全域；收到 SIGTERM 時要先 await provider.shutdown() 再結束。\napi 的輸出：\n${stack.api.output().slice(-800)}`)
  const find = (service: string, kind: Span['kind']) => {
    const list = spans.filter(s => s.service === service && s.kind === kind)
    assert.equal(list.length, 1, `${service} 應該剛好有 1 個 ${kind} span，實際有 ${list.length} 個。收到的 span：\n${show(spans)}\n（service 是 resource 的 service.name；kind 要在 startActiveSpan 的選項裡設 SpanKind.${kind}）`)
    return list[0]
  }
  return { traceId, parentId, status, spans, find }
}

test('api 的 SERVER、CLIENT 與 kitchen 的 SERVER span 在同一條 trace，父子關係正確', async () => {
  const { traceId, parentId, status, spans, find } = await one()
  assert.equal(status, 201, `POST /orders 應該回 201，實際是 ${status}`)
  const server = find('cafe-api', 'SERVER'), client = find('cafe-api', 'CLIENT'), kitchen = find('kitchen', 'SERVER')
  for (const s of [server, client, kitchen])
    assert.equal(s.traceId, traceId, `${s.service} 的 ${s.kind} span 不在傳入的 trace 裡：api 要用 propagation.extract 讀進來的 traceparent；api 呼叫 kitchen 前要 propagation.inject 到標頭、kitchen 也要 extract。\n${show(spans)}`)
  assert.equal(server.parentSpanId, parentId, `api 的 SERVER span 的 parent 應該是 traceparent 裡的 parent-id（${parentId}）：startActiveSpan 的第三個參數要傳 extract 回來的情境`)
  assert.equal(client.parentSpanId, server.spanId, 'api 的 CLIENT span 應該是 SERVER span 的子 span：在 SERVER span 的 callback 裡面（它是 active span 時）建立 CLIENT span')
  assert.equal(kitchen.parentSpanId, client.spanId, `kitchen 的 SERVER span 的 parent 應該是 api 的 CLIENT span（${client.spanId}）：inject 要在 CLIENT span 是 active 時呼叫，kitchen 要在 extract 回來的情境下建立 span`)
})

test('span 名稱用路由樣板，屬性與 service.name 照語意慣例', async () => {
  const { find } = await one({}, '/orders?source=pos')
  const server = find('cafe-api', 'SERVER'), client = find('cafe-api', 'CLIENT'), kitchen = find('kitchen', 'SERVER')
  assert.equal(server.name, 'POST /orders', `api SERVER span 的名稱應該是 "POST /orders"（方法 + 路由樣板），實際是 "${server.name}"：不要用 req.url，裡面有查詢字串和 id，會變成高基數`)
  assert.equal(kitchen.name, 'POST /tickets', `kitchen SERVER span 的名稱應該是 "POST /tickets"，實際是 "${kitchen.name}"`)
  for (const [s, route] of [[server, '/orders'], [kitchen, '/tickets']] as const) {
    assert.equal(s.attrs['http.request.method'], 'POST', `${s.service} 的 SERVER span 要有屬性 http.request.method = POST（ATTR_HTTP_REQUEST_METHOD）`)
    assert.equal(s.attrs['http.route'], route, `${s.service} 的 SERVER span 要有屬性 http.route = ${route}（ATTR_HTTP_ROUTE）`)
    assert.equal(s.attrs['http.response.status_code'], 201, `${s.service} 的 SERVER span 要有屬性 http.response.status_code = 201（數字），在 end 之前寫上`)
  }
  assert.equal(client.attrs['http.request.method'], 'POST', 'api 的 CLIENT span 要有屬性 http.request.method = POST')
  assert.match(String(client.attrs['url.full'] ?? ''), /^http:\/\/127\.0\.0\.1:\d+\/tickets$/, 'api 的 CLIENT span 要有屬性 url.full：呼叫 kitchen 的完整網址')
  assert.equal(client.attrs['http.response.status_code'], 201, 'api 的 CLIENT span 要有屬性 http.response.status_code = 201')
})

test('kitchen 回 500 時，api 與 kitchen 的 span 都是 ERROR，例外記成事件', async () => {
  const { status, find } = await one({ KITCHEN_FAIL: '1' })
  assert.equal(status, 502, `kitchen 失敗時 api 應該回 502，實際是 ${status}`)
  const server = find('cafe-api', 'SERVER'), client = find('cafe-api', 'CLIENT'), kitchen = find('kitchen', 'SERVER')
  assert.equal(kitchen.status, 'ERROR', 'kitchen 的 SERVER span 狀態要是 ERROR：catch 裡 span.setStatus({ code: SpanStatusCode.ERROR })')
  assert.ok(kitchen.events.includes('exception'), 'kitchen 的 SERVER span 要有 exception 事件：catch 裡呼叫 span.recordException(err)')
  assert.equal(kitchen.attrs['http.response.status_code'], 500, 'kitchen 的 SERVER span 的 http.response.status_code 要是 500')
  assert.equal(client.status, 'ERROR', 'api 的 CLIENT span 狀態要是 ERROR：kitchen 回 500 時要設成 ERROR')
  assert.ok(client.events.includes('exception'), 'api 的 CLIENT span 要有 exception 事件：catch 裡呼叫 span.recordException(err)')
  assert.equal(client.attrs['http.response.status_code'], 500, 'api 的 CLIENT span 的 http.response.status_code 要是 500（kitchen 回的狀態碼），在判斷 res.ok 之前寫上')
  assert.equal(server.status, 'ERROR', 'api 的 SERVER span 狀態要是 ERROR：回應是 5xx（502）時設成 ERROR')
  assert.equal(server.attrs['http.response.status_code'], 502, 'api 的 SERVER span 的 http.response.status_code 要是 502')
})

test('連續送 10 個請求後立刻 SIGTERM，30 個 span 一個都沒少', async () => {
  const stack = await startStack(dir)
  const traces = Array.from({ length: 10 }, () => hex(16))
  try {
    for (const t of traces) await (await order(stack.api, `00-${t}-${hex(8)}-01`, `req-${hex(4)}`)).text()
  } finally {
    await stack.stop()                               // 不等 BatchSpanProcessor 的 5 秒排程
  }
  const spans = stack.collector.spans
  assert.equal(spans.length, 30, `應該收到 30 個 span（每個請求 3 個），實際收到 ${spans.length} 個：收到 SIGTERM 時要先 await provider.shutdown()（兩個服務都要）再 process.exit；每個 span 都要在 finally 裡 end`)
  for (const t of traces) assert.equal(spans.filter(s => s.traceId === t).length, 3, `trace ${t} 應該有 3 個 span`)
  const posts = stack.collector.posts.length
  assert.ok(posts < 10, `30 個 span 用了 ${posts} 次匯出請求：要用 BatchSpanProcessor 攢一批再送，不是 SimpleSpanProcessor 每個 span 送一次`)
})
