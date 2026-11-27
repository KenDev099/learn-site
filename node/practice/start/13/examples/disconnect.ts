// node examples/disconnect.ts，然後：
//   curl http://localhost:3000/report      （等 5 秒才回應，中途按 Ctrl+C 離開）
//   curl http://localhost:3000/report      （等它正常完成，比較兩次印出的內容）
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const server = createServer(async (req, res) => {
  res.on('close', () => {
    console.log('res close：writableFinished =', res.writableFinished, '，signal.aborted =', req.signal.aborted)
  })
  try {
    await sleep(5000, undefined, { signal: req.signal })   // 假裝在查資料庫；客戶端離開就取消
    res.end(Buffer.from('報表完成\n'))
  } catch (err) {
    if ((err as Error).name === 'AbortError') return console.log('客戶端離開了，停止產生報表')
    throw err
  }
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
