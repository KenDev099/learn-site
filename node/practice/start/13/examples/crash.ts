// node examples/crash.ts，然後：
//   curl http://localhost:3000/slow &   （這個請求要 3 秒）
//   curl http://localhost:3000/boom      （async 處理函式丟出錯誤）
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const server = createServer(async (req, res) => {
  if (req.url === '/slow') {
    await sleep(3000)
    return res.end('慢的請求完成\n')
  }
  if (req.url === '/boom') {
    await sleep(10)
    throw new Error('查詢失敗：資料庫密碼 s3cret')
  }
  res.end('ok\n')
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
