// Kubernetes 課的 cafe-api：沒有任何 npm 套件，Node 24 直接執行 .ts（type stripping）
// 映像由 bin/images.mjs 建置成 learn-k8s/cafe-api:<tag>，各課的 manifest 用環境變數打開需要的行為。
// 訂單存在記憶體裡（每個 Pod 各一份）；「資料庫可連」只檢查 TCP 連得上，這門課練的是部署而不是 SQL。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { hostname } from 'node:os'
import { pbkdf2, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const env = process.env
const PORT = Number(env.PORT ?? 3000)
const VERSION = env.APP_VERSION ?? 'dev'
const INSTANCE = hostname()
const DRAIN_MS = Number(env.DRAIN_MS ?? 5000)
const REQUIRE_DB = env.REQUIRE_DB !== '0'

function log(level: string, msg: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, msg, instance: INSTANCE, version: VERSION, ...extra }) + '\n')
}

if (env.CRASH_ON_START === '1') {
  log('fatal', 'startup failed: CRASH_ON_START=1')
  process.exit(1)
}

const PRODUCTS = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]
const orders = new Map<number, { id: number, productId: number, quantity: number, total: number }>()
let draining = false

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// 只確認 TCP 連得上（2 秒逾時）
function reachable(url: string | undefined, defaultPort: number): Promise<boolean> {
  if (!url) return Promise.resolve(false)
  let u: URL
  try { u = new URL(url) } catch { return Promise.resolve(false) }
  return new Promise(resolve => {
    const s = connect({ host: u.hostname, port: Number(u.port || defaultPort), timeout: 2000 })
    const done = (ok: boolean) => { s.destroy(); resolve(ok) }
    s.once('connect', () => done(true)).once('timeout', () => done(false)).once('error', () => done(false))
  })
}

async function readiness(): Promise<{ ok: boolean, checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = { draining }
  if (REQUIRE_DB) checks.database = await reachable(env.DATABASE_URL, 5432)
  if (env.REDIS_URL) checks.redis = await reachable(env.REDIS_URL, 6379)
  const ok = !draining && (!REQUIRE_DB || checks.database) && (!env.REDIS_URL || checks.redis)
  return { ok, checks }
}

// 只回非機密的設定：固定幾個鍵，加上所有 CAFE_ 開頭的環境變數
function config() {
  const out: Record<string, unknown> = { instance: INSTANCE, version: VERSION }
  for (const k of Object.keys(env).sort())
    if (['APP_ENV', 'LOG_LEVEL', 'FEATURE_LOYALTY', 'DRAIN_MS', 'NODE_OPTIONS', 'UV_THREADPOOL_SIZE'].includes(k) || k.startsWith('CAFE_')) out[k] = env[k]
  if (env.DB_PASSWORD_FILE) {
    try { out.dbPasswordLoaded = readFileSync(env.DB_PASSWORD_FILE, 'utf8').length > 0 } catch { out.dbPasswordLoaded = false }
  }
  return out
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  res.setHeader('x-instance', INSTANCE)
  const url = new URL(req.url ?? '/', 'http://x')
  const route = `${req.method} ${url.pathname}`
  if (!url.pathname.startsWith('/health/'))
    res.on('finish', () => log('info', 'request', { method: req.method, path: url.pathname, status: res.statusCode, duration_ms: Date.now() - started }))
  try {
    if (env.ECHO_NAME) return json(res, 200, { name: env.ECHO_NAME, host: req.headers.host, path: req.url })
    if (route === 'GET /health/live') return json(res, 200, { status: 'ok' })
    if (route === 'GET /health/ready') {
      const r = await readiness()
      return json(res, r.ok ? 200 : 503, { status: r.ok ? 'ready' : 'not ready', ...r.checks })
    }
    if (route === 'GET /version') return json(res, 200, { version: VERSION, instance: INSTANCE })
    if (route === 'GET /config') return json(res, 200, config())
    if (route === 'GET /products') return json(res, 200, PRODUCTS)
    if (route === 'POST /orders') {
      const { productId, quantity = 1 } = JSON.parse((await readBody(req)).toString() || '{}')
      const product = PRODUCTS.find(p => p.id === productId)
      if (!product) return json(res, 400, { error: `沒有編號 ${productId} 的商品` })
      const order = { id: orders.size + 1, productId, quantity, total: product.price * quantity }
      orders.set(order.id, order)
      return json(res, 201, order)
    }
    const orderId = /^GET \/orders\/(\d+)$/.exec(route)?.[1]
    if (orderId) {
      const order = orders.get(Number(orderId))
      return order ? json(res, 200, order) : json(res, 404, { error: 'not found' })
    }
    if (route === 'GET /burn') {   // 佔用 CPU：同步忙碌 ms 毫秒（最多 1000）
      const ms = Math.min(Number(url.searchParams.get('ms') ?? 10), 1000)
      const end = Date.now() + ms
      while (Date.now() < end);
      return json(res, 200, { burnedMs: ms })
    }
    if (route === 'POST /alloc') {   // 佔用記憶體：配置 mb MB 的 Buffer（heap 以外）0.5 秒，回應後釋放
      const mb = Math.min(Number(url.searchParams.get('mb') ?? 10), 2048)
      let buf: Buffer | null = Buffer.alloc(mb * 1024 * 1024, 1)
      await new Promise(r => setTimeout(r, 500))
      const size = buf.length
      buf = null
      return json(res, 200, { allocatedMB: size / 1024 / 1024 })
    }
    if (route === 'GET /slow') {
      const ms = Math.min(Number(url.searchParams.get('ms') ?? 1000), 30_000)
      await new Promise(r => setTimeout(r, ms))
      return json(res, 200, { sleptMs: ms })
    }
    if (route === 'POST /debug/hang') {   // 讓 event loop 永遠卡住：之後所有請求（包含 liveness）都不會有回應
      json(res, 200, { hanging: true })
      setTimeout(() => { for (;;); }, 100)
      return
    }
    if (route === 'GET /hash') {   // pbkdf2 非同步版本：走 libuv thread pool（UV_THREADPOOL_SIZE）
      const hash = await new Promise<string>((resolve, reject) =>
        pbkdf2('latte', 'salt', 100_000, 64, 'sha512', (e, key) => e ? reject(e) : resolve(key.toString('hex').slice(0, 16))))
      return json(res, 200, { hash })
    }
    if (route === 'GET /menu-proxy') {
      if (!env.MENU_URL) return json(res, 500, { error: '沒有設定 MENU_URL' })
      try {
        const r = await fetch(env.MENU_URL, { signal: AbortSignal.timeout(3000) })
        return json(res, r.ok ? 200 : 502, { menuUrl: env.MENU_URL, status: r.status, menu: await r.json().catch(() => null) })
      } catch (e) {
        return json(res, 502, { menuUrl: env.MENU_URL, error: String((e as Error).cause ?? e) })
      }
    }
    const receipts = env.RECEIPTS_DIR ?? '/data'
    if (route === 'POST /receipts') {
      const body = JSON.parse((await readBody(req)).toString() || '{}')
      const id = randomUUID()
      mkdirSync(receipts, { recursive: true })
      writeFileSync(join(receipts, `${id}.json`), JSON.stringify({ id, ...body }))
      return json(res, 201, { id })
    }
    if (route === 'GET /receipts') {
      let files: string[] = []
      try { files = readdirSync(receipts).filter(f => f.endsWith('.json')).sort() } catch {}
      return json(res, 200, files.map(f => JSON.parse(readFileSync(join(receipts, f), 'utf8'))))
    }
    if (route === 'POST /uploads') {
      const body = await readBody(req)
      const file = join(env.TMP_DIR ?? '/tmp', `upload-${randomUUID()}`)
      writeFileSync(file, body)
      return json(res, 200, { file, bytes: body.length })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    log('error', 'request failed', { error: String((e as Error).message ?? e) })
    if (!res.headersSent) json(res, 500, { error: String((e as Error).message ?? e) })
  }
})

if (env.HEARTBEAT_FILE) {
  const beat = () => { try { writeFileSync(env.HEARTBEAT_FILE!, new Date().toISOString() + '\n') } catch (e) { log('warn', 'heartbeat failed', { error: String(e) }) } }
  beat()
  setInterval(beat, 2000).unref()
}

// 優雅關機：SIGTERM → 不再 ready → 等 DRAIN_MS → 不收新連線、做完手上的請求 → exit 0
process.on('SIGTERM', () => {
  if (env.IGNORE_SIGTERM === '1') return log('warn', 'SIGTERM ignored (IGNORE_SIGTERM=1)')
  if (draining) return
  draining = true
  log('info', 'SIGTERM received, draining', { drainMs: DRAIN_MS })
  setTimeout(() => {
    server.close(() => { log('info', 'shutdown complete'); process.exit(0) })
    server.closeIdleConnections()
  }, DRAIN_MS)
})

setTimeout(() => {
  server.listen(PORT, '0.0.0.0', () => log('info', 'listening', { port: PORT }))
}, Number(env.STARTUP_DELAY_MS ?? 0))
