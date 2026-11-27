// 練習 1：cluster 的 primary（監督者）
// 執行：node primary.ts，另開終端機 curl http://localhost:3000/pid 幾次
import cluster from 'node:cluster'
import { join } from 'node:path'

cluster.setupPrimary({ exec: join(import.meta.dirname, 'worker.ts') })

const count = Number(process.env.WORKERS ?? 2)
for (let i = 0; i < count; i++) cluster.fork()

cluster.on('exit', (worker, code, signal) => {
  console.error(JSON.stringify({ msg: 'worker exited', pid: worker.process.pid, code, signal }))
  // TODO 1：補一個新的 worker。重啟前等 100ms × 2^(n−1)（n 是最近 10 秒內的崩潰次數），最多等 2000ms
  // TODO 2：最近 10 秒內崩潰超過 5 次：不再重啟，以結束碼 1 結束
})

// TODO 3：收到 SIGTERM 時
//   - 不再重啟任何 worker（包括正在等退避的那個）
//   - 對每個 worker 送 SIGTERM（worker.process.kill('SIGTERM')），讓它做完進行中的請求
//   - 等所有 worker 都結束後，以結束碼 0 結束
