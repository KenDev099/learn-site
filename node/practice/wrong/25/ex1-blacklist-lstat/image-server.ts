// 練習 1：菜單圖片伺服器。GET /images/<檔名> 從 public/images 送出圖片
// 標準答案：解碼 → 白名單副檔名 → resolve 後比對「根目錄＋分隔符號」→ realpath 之後再比對一次
import { createServer, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

// 根目錄本身也先 realpath：macOS 的暫存資料夾 /var 其實是 /private/var 的符號連結
const ROOT = await realpath(join(import.meta.dirname, 'public', 'images'))
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

// name 是網址 /images/ 後面那一段，還沒解碼，例如 'latte.jpg'、'seasonal%2Fpumpkin.webp'
// 回傳要送出的檔案的絕對路徑；不可以送就回傳 null
async function resolveImage(name: string): Promise<string | null> {
  let rel: string
  try {
    rel = decodeURIComponent(name)
  } catch {
    return null
  }
  // 黑名單：擋掉 ..、絕對路徑、反斜線、NUL；只檢查最後的檔案是不是符號連結
  if (rel.includes('..') || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return null
  if (!Object.hasOwn(TYPES, extname(rel).toLowerCase())) return null
  const file = join(ROOT, rel)
  try {
    const s = await lstat(file)
    if (s.isSymbolicLink() || !s.isFile()) return null
    return file
  } catch {
    return null
  }
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
}

const server = createServer(async (req, res) => {
  // req.url 是客戶端送來的原樣字串，沒有被正規化：可能是 /images/..%2F..%2Fsecret
  const m = /^\/images\/([^?#]+)/.exec(req.url ?? '/')
  if (req.method !== 'GET' || !m) return notFound(res)
  const file = await resolveImage(m[1])
  if (!file) return notFound(res)
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
