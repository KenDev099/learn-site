// fetch 失敗時丟出來的錯誤長什麼樣：node examples/fetch-errors.ts
import { createServer } from 'node:http'
import { once } from 'node:events'

const server = createServer((req, res) => {
  if (req.url === '/503') { res.writeHead(503, { 'retry-after': '2' }).end('down for maintenance'); return }
  if (req.url === '/slow') { setTimeout(() => res.end('{}'), 3000); return }
  if (req.url === '/html') { res.end('<html>維修中</html>'); return }
  res.end('{"stock":3}')
}).listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

function show(label: string, err: unknown) {
  const e = err as Error & { cause?: Error & { code?: string, errors?: (Error & { code?: string, address?: string })[] } }
  console.log(`${label}\n  ${e.name}: ${e.message}`)
  if (e.cause) console.log(`  cause → ${e.cause.name}: ${e.cause.code ?? ''} ${e.cause.message}`)
  for (const sub of e.cause?.errors ?? []) console.log(`    · ${sub.code} ${sub.address}`)
}

const res = await fetch(base + '/503')
console.log(`1. 上游回 503：沒有 throw，res.ok = ${res.ok}，status = ${res.status}，Retry-After = ${res.headers.get('retry-after')}`)
await res.body?.cancel()

try { await fetch('http://127.0.0.1:3999/stock/1') } catch (e) { show('2. 連 127.0.0.1 上沒人聽的 port', e) }
try { await fetch('http://localhost:3999/stock/1') } catch (e) { show('3. 連 localhost 上沒人聽的 port（IPv6 和 IPv4 都試了）', e) }
try { await fetch('http://no-such-host.invalid/') } catch (e) { show('4. 網域查不到', e) }
try { await fetch(base + '/slow', { signal: AbortSignal.timeout(300) }) } catch (e) { show('5. 逾時（AbortSignal.timeout(300)）', e) }
const ac = new AbortController()
setTimeout(() => ac.abort(), 100)
try { await fetch(base + '/slow', { signal: ac.signal }) } catch (e) { show('6. 呼叫端取消（ac.abort()）', e) }
try { await (await fetch(base + '/html')).json() } catch (e) { show('7. 回應不是 JSON', e) }

server.closeAllConnections()
server.close()
