// 練習 1：每個服務的 log 都要輪替，一個很吵的服務也塞不滿磁碟
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inspect, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const env = { PGPASS: randomBytes(12).toString('hex') }
const compose = (args: string[], timeout = 180_000) => run('docker', ['compose', '-p', 'ld-21', ...args], { cwd: dir, env, timeout })
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
const SERVICES = ['api', 'kitchen', 'db']
const UNIT: Record<string, number> = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }
let cfg: any = null
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const c = compose(['config', '--format', 'json'])
  if (c.code === 0) cfg = JSON.parse(c.stdout)
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '90'], 300_000)
  up = { code: r.code, out: r.stderr + '\n' + r.stdout }
})
after(() => compose(['down', '-v', '--remove-orphans']))

// 回傳這個服務的 log 最多會留幾 bytes；設定不合格時丟出說明
function capOf(name: string): number {
  const logging = cfg.services[name]?.logging
  assert.ok(logging, `${name} 沒有 logging 設定：預設的 json-file 不輪替，log 會一直長到塞滿磁碟。每個服務都要設，db 也是`)
  const driver = logging.driver ?? 'json-file'
  assert.ok(driver === 'local' || driver === 'json-file', `${name} 的 logging driver 是 ${driver}：要用 local 或 json-file（none 會把 log 全部丟掉，出事時什麼都查不到）`)
  const opts = logging.options ?? {}
  if (driver === 'json-file') assert.ok(opts['max-size'], `${name} 用 json-file 卻沒設 max-size：json-file 的 max-size 預設是無上限，等於不輪替`)
  const size = String(opts['max-size'] ?? '20m')
  const m = size.match(/^([1-9]\d*)([kmg])$/i)
  assert.ok(m, `${name} 的 max-size 是 "${size}"：要寫數字加單位，例如 10m。只寫 10 代表 10 bytes`)
  const bytes = Number(m[1]) * UNIT[m[2].toLowerCase()]
  assert.ok(bytes >= 1024 ** 2 && bytes <= 1024 ** 3, `${name} 的 max-size 是 ${size}：太小會一直輪替、查不到幾分鐘前的事；太大又失去輪替的意義。用 1m 到 1g 之間，例如 10m`)
  const files = String(opts['max-file'] ?? (driver === 'local' ? '5' : '1'))
  assert.match(files, /^[1-9]\d*$/, `${name} 的 max-file 是 "${files}"：要是正整數，而且在 YAML 裡寫成字串 "3"`)
  return bytes * Number(files)
}

test('api、kitchen、db 都設定了會輪替的 log（local，或 json-file 加 max-size）', () => {
  assert.ok(cfg, `docker compose config 失敗，compose.yaml 有語法錯誤：用 docker compose -p ld-21 config 看錯誤訊息`)
  for (const name of SERVICES) capOf(name)
})

test('啟動後每個容器實際用的 log 設定跟 compose.yaml 一致', () => {
  assert.equal(up.code, 0, `docker compose -p ld-21 up -d --wait 失敗：\n${tail(up.out)}`)
  for (const name of SERVICES) {
    const c = inspect(`ld-21-${name}-1`)
    assert.ok(c, `找不到容器 ld-21-${name}-1`)
    const want = cfg.services[name].logging
    const got = c.HostConfig.LogConfig
    assert.equal(got.Type, want.driver ?? 'json-file', `${name} 容器的 log driver 是 ${got.Type}`)
    for (const [k, v] of Object.entries(want.options ?? {})) assert.equal(got.Config[k], String(v), `${name} 容器的 ${k} 是 ${got.Config[k]}，compose.yaml 寫的是 ${v}`)
  }
})

test('api 一口氣印出 50MB 的 log 後照常服務，留下來的 log 不超過輪替上限', async () => {
  assert.equal(up.code, 0, `docker compose -p ld-21 up -d --wait 失敗：\n${tail(up.out)}`)
  const res = await fetch('http://127.0.0.1:18210/debug/log-spam?mb=50', { method: 'POST', signal: AbortSignal.timeout(120_000) })
  assert.equal(res.status, 200, `POST /debug/log-spam 回 ${res.status}`)
  assert.equal((await waitHttp('http://127.0.0.1:18210/health', 10_000)).status, 200, '印完 log 後 api 的 /health 要回 200')
  const last = run('docker', ['logs', '--tail', '3', 'ld-21-api-1'])
  assert.match(last.stdout, /spam done/, `docker logs --tail 3 ld-21-api-1 讀不到最後的 log：${last.stderr}`)
  const kept = Number(run('sh', ['-c', 'docker logs ld-21-api-1 2>&1 | wc -c']).stdout)
  const cap = capOf('api')
  assert.ok(kept <= cap * 1.1, `api 留下了 ${(kept / 1024 ** 2).toFixed(1)}MB 的 log，超過 max-size × max-file ≈ ${(cap / 1024 ** 2).toFixed(0)}MB：輪替沒有生效`)
})
