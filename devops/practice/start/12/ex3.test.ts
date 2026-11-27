// 練習 3：nginx/ex3.conf 限制請求大小、以用戶端 IP 限流並回 429
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const compose = (args: string[], timeout = 180_000) =>
  run('docker', ['compose', '-p', 'ld-12', ...args], { cwd: dir, env: { CONF: 'ex3.conf' }, timeout })
const tail = (s: string) => s.split('\n').slice(-12).join('\n')
const BASE = 'http://localhost:18120'
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '120'], 300_000)
  up = { code: r.code, out: `${r.stderr}\n${r.stdout}\n${compose(['logs', 'nginx']).stdout}` }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `CONF=ex3.conf docker compose -p ld-12 up -d --wait 失敗，nginx 的設定可能有錯：\n${tail(up.out)}`)
const post = async (path: string, mb: number) => {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: Buffer.alloc(Math.round(mb * 1024 * 1024), 97) })
  await res.arrayBuffer()
  return res.status
}
// 同時送 n 個請求，記下每個的狀態碼與花了多久
const burst = async (n: number, xff?: () => string, init: RequestInit = {}, path = '/api/products') => {
  const res = await Promise.all(Array.from({ length: n }, async () => {
    const t = performance.now()
    const r = await fetch(`${BASE}${path}`, { ...init, headers: xff ? { 'X-Forwarded-For': xff() } : {} })
    await r.arrayBuffer()
    return { status: r.status, ms: performance.now() - t }
  }))
  const list = res.map(x => x.status)
  const count = (s: number) => list.filter(x => x === s).length
  const slowest = Math.max(...res.filter(x => x.status === 200).map(x => x.ms))
  return { list, count, slowest }
}

test('/api/uploads 收 1.5MB、擋 3MB（413）；/api/orders 維持 1MB 上限', async () => {
  needUp()
  assert.equal(await post('/api/uploads', 1.5), 200, 'POST 1.5MB 到 /api/uploads 沒有回 200：在 /api/uploads 的 location 裡設 client_max_body_size 2m（後端路徑是 /uploads）')
  assert.equal(await post('/api/uploads', 3), 413, 'POST 3MB 到 /api/uploads 沒有回 413：上限是 2MB，不是關掉檢查')
  assert.equal(await post('/api/orders', 1.5), 413, 'POST 1.5MB 到 /api/orders 沒有回 413：只有 /api/uploads 放寬，其他路徑維持預設 1MB，不要在 server 或 http 層調大')
  await sleep(3_000)
})

test('同時 30 個 GET /api/products：有一部分回 429，沒有 503', async () => {
  needUp()
  const { list, count, slowest } = await burst(30)
  assert.equal(count(503), 0, `出現了 ${count(503)} 個 503：limit_req 預設用 503 拒絕，監控會當成服務故障；加 limit_req_status 429;`)
  assert.ok(count(429) >= 10, `30 個請求只有 ${count(429)} 個被限流（${list.join(',')}）：每秒 5 個、burst 10、nodelay，大約 11 個通過、其餘 429。limit_req_zone 的 key 要用 $binary_remote_addr`)
  assert.ok(count(200) >= 10 && count(200) <= 17, `通過了 ${count(200)} 個：burst 10 加 nodelay 應該讓大約 11 個請求馬上通過`)
  // 沒有 nodelay 時，nginx 讓 burst 裡的請求排隊，並在 error log 記一行 delaying request
  const logs = compose(['logs', 'nginx'])
  const delayed = `${logs.stdout}\n${logs.stderr}`.includes('delaying request')
  assert.ok(!delayed, `nginx 的 log 有 delaying request（最慢的成功請求花了 ${Math.round(slowest)} 毫秒）：沒有 nodelay 時，burst 裡的請求會照每 200 毫秒一個排隊放行；加上 nodelay 讓它們立刻處理`)
  // 速率用時間量容易受機器忙碌影響，改讀 nginx 實際生效的設定
  const conf = compose(['exec', '-T', 'nginx', 'nginx', '-T']).stdout
  const rates = [...conf.matchAll(/^\s*limit_req_zone\s[^;]*\brate=(\d+)r\/([sm])/gm)].map(m => Number(m[1]) / (m[2] === 'm' ? 60 : 1))
  assert.ok(rates.length > 0 && rates.every(r => r === 5), `limit_req_zone 的 rate 是 ${rates.join('、') || '（找不到）'} r/s：題目要求每秒 5 個（rate=5r/s）`)
})

test('等 3 秒後恢復正常', async () => {
  needUp()
  await sleep(3_000)
  const res = await fetch(`${BASE}/api/products`)
  assert.equal(res.status, 200, `3 秒後還是 ${res.status}：rate 是每秒 5 個，桶子應該已經漏空`)
})

test('每個請求帶不同的 X-Forwarded-For，還是被限流', async () => {
  needUp()
  let i = 0
  const { list, count } = await burst(30, () => `198.51.100.${++i}`)
  assert.ok(count(429) >= 10, `換 X-Forwarded-For 就繞過了限流（${list.join(',')}）：X-Forwarded-For 是用戶端可以自己寫的標頭，限流的 key 要用 nginx 看到的連線位址 $binary_remote_addr`)
})

test('POST /api/uploads 也在限流範圍內', async () => {
  needUp()
  await sleep(3_000)
  const { list, count } = await burst(30, undefined, { method: 'POST', body: 'x' }, '/api/uploads')
  assert.equal(count(503), 0, `/api/uploads 出現 503：被拒絕時要回 429`)
  assert.ok(count(429) >= 10, `同時 30 個 POST /api/uploads 只有 ${count(429)} 個被限流（${list.join(',')}）：一個請求只會進一個 location，location = /api/uploads 拿不到 location /api/ 裡的 limit_req；在那裡再寫一次，或把 limit_req 寫在 server 層`)
})
