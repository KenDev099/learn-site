// 示範：cluster 開 2 個 worker，每個程序各有一份記憶體
// 執行：node examples/cluster-state.ts，另開終端機執行幾次 curl http://localhost:3000/ ，Ctrl+C 結束
import cluster from 'node:cluster'
import { createServer } from 'node:http'

if (cluster.isPrimary) {
  console.log(`primary ${process.pid}：啟動 2 個 worker`)
  for (let i = 0; i < 2; i++) cluster.fork()
  cluster.on('exit', (worker, code, signal) => console.log(`worker ${worker.process.pid} 結束（code ${code}, signal ${signal}）`))
} else {
  // 「目前為止處理了幾杯」：存在這個程序的記憶體裡
  let count = 0
  createServer((req, res) => {
    count++
    res.end(`worker ${process.pid}：這個程序已處理 ${count} 個請求\n`)
  }).listen(Number(process.env.PORT ?? 3000), () => console.log(`worker ${process.pid} 開始接連線`))
}
