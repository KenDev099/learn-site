// 在測試的同一個程序裡啟動 node:http 伺服器：listen(0) 讓系統分配 port
import type { Server } from 'node:http'
import { once } from 'node:events'
import { after } from 'node:test'

export async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as { port: number }
  const close = async () => {
    if (!server.listening) return
    server.closeAllConnections()
    await new Promise(r => server.close(r))
  }
  after(close)
  return { url: `http://127.0.0.1:${port}`, port, close }
}
