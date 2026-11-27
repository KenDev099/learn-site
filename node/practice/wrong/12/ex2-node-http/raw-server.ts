import { createServer } from 'node:http'
import type { Server } from 'node:net'

export function createRawServer(): Server {
  return createServer((req, res) => {
    const body = JSON.stringify({ message: '歡迎光臨' })
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Connection: 'close' })
    res.end(body)
  })
}
