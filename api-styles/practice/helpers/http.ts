// 在測試的同一個程序裡啟動伺服器：listen(0) 讓系統分配 port，測試檔結束時自動關掉
// HTTP/1.1（http.createServer：Yoga、Pact provider、Connect JSON）和 HTTP/2（http2.createServer：gRPC）都可以
import type { Server } from 'node:http'
import type { Http2Server, ServerHttp2Session } from 'node:http2'
import { once } from 'node:events'
import { after } from 'node:test'

export async function listen(server: Server | Http2Server) {
  const sessions = new Set<ServerHttp2Session>()
  server.on('session', (s: ServerHttp2Session) => { sessions.add(s); s.on('close', () => sessions.delete(s)) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as { port: number }
  const close = async () => {
    if (!server.listening) return
    if ('closeAllConnections' in server) server.closeAllConnections()
    for (const s of sessions) s.destroy()
    await new Promise(r => server.close(r))
  }
  after(close)
  return { url: `http://127.0.0.1:${port}`, port, close }
}
