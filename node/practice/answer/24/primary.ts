// 練習 1：cluster 的 primary（監督者）
// 執行：node primary.ts，另開終端機 curl http://localhost:3000/pid 幾次
import cluster from 'node:cluster'
import { once } from 'node:events'
import { join } from 'node:path'

cluster.setupPrimary({ exec: join(import.meta.dirname, 'worker.ts') })

const count = Number(process.env.WORKERS ?? 2)
for (let i = 0; i < count; i++) cluster.fork()

const WINDOW_MS = 10_000
const MAX_CRASHES = 5
const crashes: number[] = []   // 最近的崩潰時間
const pending = new Set<NodeJS.Timeout>()   // 還在退避、等著重啟的計時器
let shuttingDown = false

cluster.on('exit', (worker, code, signal) => {
  console.error(JSON.stringify({ msg: 'worker exited', pid: worker.process.pid, code, signal }))
  if (shuttingDown) return   // 是我們叫它結束的，不用補

  const now = Date.now()
  crashes.push(now)
  while (crashes[0] < now - WINDOW_MS) crashes.shift()   // 只算最近 10 秒
  if (crashes.length > MAX_CRASHES) {
    // 崩潰迴圈：重啟也沒用，交給上一層（Docker、Kubernetes）並讓人來看 log
    console.error(JSON.stringify({ msg: 'crash loop, giving up', crashes: crashes.length }))
    process.exit(1)
  }
  const delay = Math.min(100 * 2 ** (crashes.length - 1), 2000)   // 100、200、400、800、1600
  const timer = setTimeout(() => {
    pending.delete(timer)
    cluster.fork()
  }, delay)
  pending.add(timer)
})

process.on('SIGTERM', async () => {
  shuttingDown = true
  for (const t of pending) clearTimeout(t)
  const workers = Object.values(cluster.workers ?? {}).filter(w => w !== undefined)
  // 先掛好 exit 再送訊號，才不會錯過
  const exits = workers.map(w => once(w, 'exit'))
  for (const w of workers) w.process.kill('SIGTERM')
  await Promise.all(exits)
  console.log(JSON.stringify({ msg: 'all workers stopped' }))
  process.exit(0)
})
