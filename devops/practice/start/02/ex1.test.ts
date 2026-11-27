// 練習 1：top-errors.sh 找出 5xx 最多的路徑。在 Debian 容器裡用 bash 執行（GNU 工具），先跑附的 access.log，再跑測試當場產生的 log
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-02-ex1'
const inBox = (script: string, input = '') =>
  run('docker', ['run', '--rm', '-i', '--name', NAME, '-v', `${dir}:/w:ro`, '-w', '/w', 'debian:trixie-slim', 'bash', '-c', script], { input, timeout: 180_000 })

// 正確答案：解析 combined 格式，只看狀態碼那一欄
function expected(log: string) {
  const count = new Map<string, number>()
  for (const line of log.split('\n')) {
    const m = line.match(/^\S+ \S+ \S+ \[[^\]]*\] "\S+ (\S+) \S+" (\d{3}) /)
    if (m && m[2][0] === '5') count.set(m[1], (count.get(m[1]) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 3).map(([p, n]) => `${n} ${p}`)
}
const lines = (s: string) => s.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean)

// 固定種子的亂數（mulberry32）：每次產生同一份 log，結果可重現
let seed = 20261031
function randomInt(min: number, max?: number) {
  if (max === undefined) [min, max] = [0, min]
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return min + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min))
}

// 跟附的 access.log 不同的 log：第 3、4 名同次數、4xx（含 405）最多的路徑、回應大小 5xx 的 200、路徑裡有 500
function randomLog() {
  const pool = ['/orders', '/cart/items', '/products', '/uploads', '/cart', '/menu', '/health/ready', '/orders/42', '/loyalty', '/receipts']
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const [a, b, c, d, e, bad4xx, big] = pool
  const top = randomInt(8, 12), tie = randomInt(3, 6)
  const rows: [string, number, number][] = []
  const add = (path: string, n: number, status: (i: number) => number, size: () => number) => { for (let i = 0; i < n; i++) rows.push([path, status(i), size()]) }
  add(a, top, () => [500, 502, 503, 504][randomInt(4)], () => 157)
  add(b, tie + 2, () => [500, 503][randomInt(2)], () => 0)
  add(c, tie, () => 502, () => 157)
  add(d, tie, () => 504, () => 167)
  add(e, 1, () => 500, () => 157)
  add(bad4xx, top + 4, i => i % 2 ? [400, 404, 429][i % 3] : 405, () => 64)  // 一半是 405（至少 6 次，多過第 3 名）：狀態碼裡有 5 不代表是 5xx
  add(big, top + 3, () => 200, () => randomInt(500, 600))
  add('/orders/500', top + 2, () => 200, () => 412)
  add('/products', 15, () => [200, 304][randomInt(2)], () => 1043)
  for (let i = rows.length - 1; i > 0; i--) { const j = randomInt(i + 1); [rows[i], rows[j]] = [rows[j], rows[i]] }
  return rows.map(([p, s, z], i) =>
    `10.0.${randomInt(256)}.${randomInt(1, 255)} - - [31/Oct/2026:10:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} +0800] "${s >= 500 ? 'POST' : 'GET'} ${p} HTTP/1.1" ${s} ${z} "-" "curl/8.7.1"`).join('\n') + '\n'
}

before(() => { requireDocker(); removeContainers(NAME) })
after(() => removeContainers(NAME))

test('附的 access.log：印出 5xx 最多的前 3 個路徑', () => {
  const r = inBox('bash top-errors.sh access.log')
  assert.equal(r.code, 0, `bash top-errors.sh access.log 失敗（結束碼 ${r.code}）：${r.stderr}`)
  const want = expected(readFileSync(join(dir, 'access.log'), 'utf8'))
  assert.deepEqual(lines(r.stdout), want, `每行「次數 路徑」，只算第 9 欄（狀態碼）是 5 開頭的請求。應該印出：\n${want.join('\n')}`)
})

test('另一份 log（放在有空白的路徑裡）：結果也要對，不能寫死', () => {
  const log = randomLog()
  const r = inBox('mkdir -p "/tmp/my logs" && cat > "/tmp/my logs/access.log" && bash /w/top-errors.sh "/tmp/my logs/access.log"', log)
  assert.equal(r.code, 0, `對 "/tmp/my logs/access.log" 執行失敗（結束碼 ${r.code}）：${r.stderr}\n檔名參數要寫成 "$log"（加引號）`)
  const got = lines(r.stdout), want = expected(log)
  assert.deepEqual(got, want, `這份 log 的正確答案是：\n${want.join('\n')}\n你的輸出：\n${got.join('\n')}\n檢查：只看狀態碼欄、而且是 5 開頭（不是整行找 5，405 也不算）、不算 4xx、同次數時路徑由小到大（sort -k1,1nr -k2,2）`)
})
