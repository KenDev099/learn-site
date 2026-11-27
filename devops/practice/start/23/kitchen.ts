// kitchen 服務：POST /tickets 收到訂單就出單。KITCHEN_FAIL=1 時出單機卡紙、回 500
// 自己試：PORT=3001 node kitchen.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api'
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions'
import { createLogger } from './logger.ts'
import { setupTracing } from './tracing.ts'

const provider = setupTracing('kitchen')
const tracer = trace.getTracer('kitchen')
const log = createLogger('kitchen')

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

async function printTicket(req: IncomingMessage, res: ServerResponse, request_id: string) {
  const order = await readBody(req)
  log.info({ request_id, items: order.items?.length ?? 0 }, 'ticket received')
  await sleep(30)                                                   // 出單機要一點時間
  if (process.env.KITCHEN_FAIL === '1') throw new Error('出單機卡紙')
  const ticket = `T-${request_id}`
  log.info({ request_id, ticket }, 'ticket printed')
  res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ ticket }))
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://kitchen')
  if (req.method !== 'POST' || pathname !== '/tickets') {
    res.writeHead(404).end()
    return
  }
  const request_id = String(req.headers['x-request-id'] ?? 'none')
  // 練習 2：用 propagation.extract 從 req.headers 取出上游的情境，在那個情境下用 tracer.startActiveSpan
  // 建立 SERVER span（名稱 POST /tickets，屬性 http.request.method、http.route）；
  // 出錯時記下例外、狀態設成 ERROR；最後寫上 http.response.status_code，並且一定要 end
  try {
    await printTicket(req, res, request_id)
  } catch (err) {
    log.error({ request_id, err }, 'ticket failed')
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'ticket failed' }))
  }
})

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const addr = server.address()
  log.info({ port: typeof addr === 'object' && addr ? addr.port : null }, 'listening')
})

process.on('SIGTERM', async () => {
  server.close()
  // 練習 2：結束之前，把還在記憶體裡的 span 送出去
  process.exit(0)
})
