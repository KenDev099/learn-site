// SSE 示範：每秒推送一次訂單狀態，每 5 秒一次心跳
// 執行後在另一個終端機：curl -N http://localhost:3000/events
import { createServer } from 'node:http'

const STATUSES = ['brewing', 'ready', 'picked_up']

const server = createServer((req, res) => {
  if (req.url !== '/events') return res.writeHead(404).end()
  const lastId = Number(req.headers['last-event-id'] ?? 0)   // 瀏覽器重連時會帶上最後收到的 id
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  res.flushHeaders()
  let id = lastId
  const tick = setInterval(() => {
    id++
    res.write(`id: ${id}\nevent: status\ndata: ${JSON.stringify({ orderId: 42, status: STATUSES[(id - 1) % 3] })}\n\n`)
  }, 1000)
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 5000)
  res.on('close', () => {
    clearInterval(tick)
    clearInterval(heartbeat)
    console.log(JSON.stringify({ msg: 'client left', lastId: id }))
  })
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
