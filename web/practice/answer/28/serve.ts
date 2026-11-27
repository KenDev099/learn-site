// 靜態檔案伺服器：node serve.ts dist 會開在 http://localhost:4173/
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
}

// 網址對應到 root 裡的檔案；目錄網址找 index.html；找不到或跑出 root 就回傳 null
async function find(root: string, pathname: string): Promise<string | null> {
  try {
    let p = decodeURIComponent(pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = resolve(root, '.' + p)
    if (!file.startsWith(resolve(root) + sep)) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

export function serve(root: string, port = 0): Promise<{ url: string, close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const file = await find(root, pathname)
    if (file) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(await readFile(file))
      return
    }
    // 找不到：回 404 狀態碼，內容用 404.html
    res.writeHead(404, { 'content-type': TYPES['.html'] })
    res.end(await readFile(join(root, '404.html')))
  })
  return new Promise(ok => server.listen(port, 'localhost', () => {
    const { port } = server.address() as { port: number }
    ok({
      url: `http://localhost:${port}`,
      close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }),
    })
  }))
}

if (import.meta.main) {
  const { url } = await serve(process.argv[2] ?? 'dist', 4173)
  console.log(`網站開在 ${url}/，按 Ctrl+C 結束`)
}
