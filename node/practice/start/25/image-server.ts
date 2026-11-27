// 練習 1：菜單圖片伺服器。GET /images/<檔名> 從 public/images 送出圖片
// 這個版本會被路徑穿越：改 resolveImage，讓所有跑出 public/images 的路徑都回 null（→ 404）
import { createServer, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

const ROOT = join(import.meta.dirname, 'public', 'images')
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

// name 是網址 /images/ 後面那一段，還沒解碼，例如 'latte.jpg'、'seasonal%2Fpumpkin.webp'
// 回傳要送出的檔案的絕對路徑；不可以送就回傳 null
async function resolveImage(name: string): Promise<string | null> {
  const file = join(ROOT, decodeURIComponent(name))
  try {
    if (!(await stat(file)).isFile()) return null
  } catch {
    return null
  }
  return file
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
