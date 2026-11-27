// 練習 2、3 的測試工具（不用改）：假的 OTLP/HTTP 接收器，以及啟動、停止 api.ts 與 kitchen.ts
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export type Span = {
  service: string, traceId: string, spanId: string, parentSpanId: string, name: string,
  kind: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER' | 'UNSPECIFIED',
  attrs: Record<string, unknown>, status: 'UNSET' | 'OK' | 'ERROR', events: string[],
}

// OTLP/JSON 的列舉是數字，而且跟 @opentelemetry/api 的 SpanKind 不一樣（OTLP 多了 0 = UNSPECIFIED）
const KINDS = ['UNSPECIFIED', 'INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'] as const
const STATUS = ['UNSET', 'OK', 'ERROR'] as const
const value = (v: any): unknown => v?.stringValue ?? (v?.intValue !== undefined ? Number(v.intValue) : v?.boolValue ?? v?.doubleValue)
const attrs = (list: any[] = []) => Object.fromEntries(list.map(a => [a.key, value(a.value)]))

// 在 127.0.0.1 隨機的 port 上收 POST /v1/traces（JSON），把每個 span 攤平
export async function startCollector() {
  const spans: Span[] = []
  const posts: string[] = []                        // 每次匯出請求是哪個服務送的
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      try {
        for (const rs of JSON.parse(body).resourceSpans ?? []) {
          const service = String(attrs(rs.resource?.attributes)['service.name'] ?? '')
          posts.push(service)
          for (const ss of rs.scopeSpans ?? []) for (const s of ss.spans ?? []) spans.push({
            service, traceId: s.traceId, spanId: s.spanId, parentSpanId: s.parentSpanId ?? '', name: s.name,
            kind: KINDS[s.kind ?? 0], attrs: attrs(s.attributes), status: STATUS[s.status?.code ?? 0], events: (s.events ?? []).map((e: any) => e.name),
          })
        }
      } catch {}
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    spans,
    posts,
    close: () => new Promise(r => server.close(r)),
  }
}

// 啟動一個服務（node api.ts／kitchen.ts），等它印出 listening 的 port
export async function startService(dir: string, file: string, env: Record<string, string>) {
  const p = spawn(process.execPath, [file], { cwd: dir, env: { ...process.env, PORT: '0', ...env } })
  let out = ''
  p.stdout.on('data', d => out += d)
  p.stderr.on('data', d => out += d)
  const closed = new Promise(r => p.on('close', r))
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${file} 5 秒內沒有印出 listening：\n${out.slice(-1500)}`)), 5_000)
    p.stdout.on('data', () => {
      const m = out.match(/"port":(\d+)/)
      if (m) { clearTimeout(timer); resolve(Number(m[1])) }
    })
    p.on('close', () => { clearTimeout(timer); reject(new Error(`${file} 啟動就結束了，看看是不是程式有錯：\n${out.slice(-1500)}`)) })
  })
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    output: () => out,
    // 每一行 JSON log
    lines: () => out.split('\n').flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } }),
    // 送 SIGTERM，等程序結束（最多 5 秒，之後強制結束）
    async stop() {
      if (p.exitCode !== null || p.signalCode !== null) return
      p.kill('SIGTERM')
      const timer = setTimeout(() => p.kill('SIGKILL'), 5_000)
      await closed
      clearTimeout(timer)
    },
  }
}

// 起一組：接收器、kitchen、api（api 的 KITCHEN_URL 指向 kitchen）
export async function startStack(dir: string, kitchenEnv: Record<string, string> = {}) {
  const collector = await startCollector()
  const env = { OTEL_EXPORTER_OTLP_ENDPOINT: collector.url }
  const kitchen = await startService(dir, 'kitchen.ts', { ...env, ...kitchenEnv })
  const api = await startService(dir, 'api.ts', { ...env, KITCHEN_URL: kitchen.url })
  return {
    collector, kitchen, api,
    // 停掉兩個服務（SIGTERM），再多等一下讓還在路上的匯出請求到達，然後關掉接收器
    async stop() {
      await Promise.all([api.stop(), kitchen.stop()])
      await new Promise(r => setTimeout(r, 100))
      await collector.close()
    },
  }
}

export const hex = (bytes: number) => randomBytes(bytes).toString('hex')

export function order(api: { url: string }, traceparent: string, requestId: string, path = '/orders') {
  return fetch(api.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', traceparent, 'x-request-id': requestId },
    body: JSON.stringify({ items: [{ productId: 2, quantity: 1 }] }),
  })
}
