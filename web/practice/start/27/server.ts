// 練習用的咖啡店網站：用 node:http 在隨機 port 提供 site/ 的靜態檔（不用改這個檔案）
// patch(path, body) 讓測試做出「刻意弄壞」的網站變體；soft404 讓找不到的網址回 200（常見的錯誤設定）
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, 'site')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

export type Order = { items: { name: string, size: string, qty: number }[], name: string, phone: string }
export type Site = { url: string, orders: Order[], close: () => Promise<void> }
export type Options = { patch?: (path: string, body: string) => string, soft404?: boolean }

export async function startSite({ patch = (_p, b) => b, soft404 = false }: Options = {}): Promise<Site> {
  const orders: Order[] = []
  let nextId = 1024
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === '/api/orders' && req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      orders.push(JSON.parse(raw))
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'A' + nextId++ }))
      return
    }
    const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path))
    let status = 200, body: string
    try {
      if (!file.startsWith(ROOT)) throw new Error('outside')
      body = await readFile(file, 'utf8')
    } catch {
      status = soft404 ? 200 : 404
      body = await readFile(join(ROOT, '404.html'), 'utf8')
    }
    res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? TYPES['.html'], 'cache-control': 'no-store' })
    res.end(patch(path, body))
  })
  await new Promise<void>(ok => server.listen(0, 'localhost', ok))
  const { port } = server.address() as { port: number }
  return {
    url: `http://localhost:${port}`,
    orders,
    close: () => new Promise<void>(ok => { server.closeAllConnections(); server.close(() => ok()) }),
  }
}
