// 練習 3 用的伺服器：不用改這個檔案，改 http-utils.ts 的 withErrorHandling
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { MENU } from './menu.ts'
import { sendError, sendJson, withErrorHandling, type Handler } from './http-utils.ts'

const routes: Record<string, Handler> = {
  '/menu': (req, res) => sendJson(res, 200, MENU),
  // 一般函式裡同步 throw
  '/boom-sync': () => {
    throw new Error('同步出錯：資料庫密碼 s3cret-sync')
  },
  // async 函式裡 throw：變成 rejected Promise
  '/boom-async': async () => {
    await sleep(10)
    throw new Error('非同步出錯：資料庫密碼 s3cret-async')
  },
  // 標頭和一部分 body 已經送出去之後才出錯
  '/boom-after-headers': async (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.write(Buffer.from('報表第一段…\n'))
    await sleep(10)
    throw new Error('送到一半出錯：s3cret-after')
  },
}

const server = createServer(withErrorHandling((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  const handler = routes[pathname]
  if (!handler) return sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
  return handler(req, res)
}))

// 本課程的約定：PORT 沒給就用 3000；聽好之後印一行 JSON，測試靠它知道 port
server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
