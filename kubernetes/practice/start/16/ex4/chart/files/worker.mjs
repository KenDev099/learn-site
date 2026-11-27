// 咖啡店的收據 worker（課程提供，不用改）。
// 正式專案裡這是 NestJS 課的 BullMQ worker（dist/worker.js）；這裡用沒有任何套件的簡化版，省下建置映像的時間，
// 但部署上要處理的事情一樣：連 Redis、一次做一個 job、收到 SIGTERM 先把手上的 job 做完再結束。
//   佇列：Redis list receipts:pending（付款完成時由 API 放入訂單編號）
//   做法：BLMOVE 到 receipts:processing → 產生收據（約 48 MB 記憶體）並寄出（用 JOB_MS 模擬）→ SET receipt:<id> NX 記錄 → 從 processing 移除
//   冪等：同一張訂單重複出現時，SET NX 只有第一次成功，receipts:sent 只加一次
import net from 'node:net'

const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
const JOB_MS = Number(process.env.JOB_MS ?? 2000)
const RECEIPT_MB = 48                                     // 產生一張收據 PDF 大約要用的記憶體
const log = (msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }))

// 最小的 Redis 協定（RESP）用戶端：送出指令、依序取回回覆
const sock = net.connect(Number(url.port || 6379), url.hostname)
const waiting = []
let buf = Buffer.alloc(0)
sock.on('data', d => {
  buf = Buffer.concat([buf, d])
  for (;;) {
    const r = parse(buf, 0)
    if (!r) break
    buf = buf.subarray(r.end)
    const w = waiting.shift()
    r.value instanceof Error ? w.reject(r.value) : w.resolve(r.value)
  }
})
sock.on('error', e => { log('redis error', { error: e.message }); process.exit(1) })
sock.on('close', () => { if (!stopping) { log('redis closed'); process.exit(1) } })

function parse(b, i) {
  const nl = b.indexOf('\r\n', i)
  if (nl < 0) return null
  const type = String.fromCharCode(b[i]), line = b.toString('utf8', i + 1, nl), next = nl + 2
  if (type === '+') return { value: line, end: next }
  if (type === '-') return { value: new Error(line), end: next }
  if (type === ':') return { value: Number(line), end: next }
  if (type === '$') {
    const n = Number(line)
    if (n < 0) return { value: null, end: next }
    if (b.length < next + n + 2) return null
    return { value: b.toString('utf8', next, next + n), end: next + n + 2 }
  }
  if (type === '*') {
    const n = Number(line)
    if (n < 0) return { value: null, end: next }
    const items = []
    let at = next
    for (let k = 0; k < n; k++) {
      const r = parse(b, at)
      if (!r) return null
      items.push(r.value)
      at = r.end
    }
    return { value: items, end: at }
  }
  throw new Error(`看不懂的 Redis 回覆：${type}`)
}

function cmd(...args) {
  return new Promise((resolve, reject) => {
    waiting.push({ resolve, reject })
    sock.write(`*${args.length}\r\n` + args.map(a => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join(''))
  })
}

let stopping = false
process.on('SIGTERM', () => { stopping = true; log('SIGTERM：做完手上的 job 就結束') })

if (url.password) await cmd('AUTH', decodeURIComponent(url.password))
log('worker started', { jobMs: JOB_MS })
while (!stopping) {
  const id = await cmd('BLMOVE', 'receipts:pending', 'receipts:processing', 'RIGHT', 'LEFT', '1')
  if (!id) continue
  let pdf = Buffer.alloc(RECEIPT_MB * 1024 * 1024, 1)    // 產生收據 PDF（模擬）
  await new Promise(r => setTimeout(r, JOB_MS))          // 寄收據（模擬呼叫郵件服務）
  pdf = null
  const first = await cmd('SET', `receipt:${id}`, new Date().toISOString(), 'NX')
  if (first === 'OK') await cmd('INCR', 'receipts:sent')
  await cmd('LREM', 'receipts:processing', '1', id)
  log('receipt sent', { order: id, duplicate: first !== 'OK' })
}
sock.end()
log('worker stopped')
