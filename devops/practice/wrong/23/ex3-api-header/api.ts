// cafe-api：POST /orders 收到訂單後呼叫 kitchen 出單。kitchen 失敗時回 502
// 自己試（兩個終端機）：PORT=3001 node kitchen.ts
//                       PORT=3000 KITCHEN_URL=http://localhost:3001 node api.ts
// curl -i -X POST localhost:3000/orders -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' -d '{"items":[{"productId":2,"quantity":1}]}'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api'
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_HTTP_ROUTE, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions'
import { createLogger } from './logger.ts'
import { setupTracing } from './tracing.ts'

const provider = setupTracing('cafe-api')
const tracer = trace.getTracer('cafe-api')
const log = createLogger('cafe-api')
const KITCHEN_URL = process.env.KITCHEN_URL ?? 'http://localhost:3001'

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

const send = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

async function callKitchen(order: unknown, request_id: string): Promise<{ ticket: string }> {
  const url = `${KITCHEN_URL}/tickets`
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-request-id': request_id }
  const attributes = { [ATTR_HTTP_REQUEST_METHOD]: 'POST', [ATTR_URL_FULL]: url }
  return tracer.startActiveSpan('POST', { kind: SpanKind.CLIENT, attributes }, async span => {
    try {
      propagation.inject(context.active(), headers)               // 寫入 traceparent：kitchen 才接得上這條 trace
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(order), signal: AbortSignal.timeout(3_000) })
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.status)
      if (!res.ok) throw new Error(`kitchen responded ${res.status}`)
      return await res.json() as { ticket: string }
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      throw err
    } finally {
      span.end()
    }
  })
}

async function createOrder(req: IncomingMessage, res: ServerResponse, request_id: string) {
  const order = await readBody(req)
  log.info({ trace_id: String(req.headers.traceparent).split('-')[1], span_id: String(req.headers.traceparent).split('-')[2], request_id, items: order.items?.length ?? 0 }, 'order received')
  try {
    const { ticket } = await callKitchen(order, request_id)
    log.info({ trace_id: String(req.headers.traceparent).split('-')[1], span_id: String(req.headers.traceparent).split('-')[2], request_id, ticket }, 'kitchen accepted')
    send(res, 201, { ticket })
  } catch (err) {
    log.error({ trace_id: String(req.headers.traceparent).split('-')[1], request_id, err }, 'kitchen failed')
    send(res, 502, { error: 'kitchen unavailable' })
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://cafe-api')
  if (req.method !== 'POST' || pathname !== '/orders') {
    send(res, 404, { error: 'not found' })
    return
  }
  const request_id = String(req.headers['x-request-id'] ?? randomUUID())
  const parent = propagation.extract(context.active(), req.headers)   // 上游的 traceparent → 情境
  const attributes = { [ATTR_HTTP_REQUEST_METHOD]: 'POST', [ATTR_HTTP_ROUTE]: '/orders' }
  await tracer.startActiveSpan('POST /orders', { kind: SpanKind.SERVER, attributes }, parent, async span => {
    try {
      await createOrder(req, res, request_id)
      log.info({ trace_id: String(req.headers.traceparent).split('-')[1], span_id: String(req.headers.traceparent).split('-')[2], request_id, status: res.statusCode }, 'request')
    } finally {
      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.statusCode)
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
    }
  })
})

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const addr = server.address()
  log.info({ port: typeof addr === 'object' && addr ? addr.port : null }, 'listening')
})

process.on('SIGTERM', async () => {
  server.close()
  await provider.shutdown()                                       // 送出還在記憶體裡的 span
  process.exit(0)
})
