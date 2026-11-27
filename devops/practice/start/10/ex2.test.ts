// 練習 2：migration 跑完、而且成功之後 api 才啟動；一次性服務跑完不能被重啟
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inspect, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const PGPASS = randomBytes(12).toString('hex')
const compose = (args: string[], timeout = 180_000) =>
  run('docker', ['compose', '-p', 'ld-10', ...args], { cwd: dir, env: { PGPASS }, timeout })
const container = (service: string) => inspect(compose(['ps', '-aq', service]).stdout.split('\n')[0] || 'ld-10-none')
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
const mentionsMigrate = (cmd: unknown) => /migrate/.test([cmd ?? ''].flat().join(' '))
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '90', '--build'], 600_000)
  up = { code: r.code, out: r.stderr + '\n' + r.stdout }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `docker compose -p ld-10 up -d --wait --build 失敗：\n${tail(up.out)}\n用 docker compose -p ld-10 ps -a 和 docker compose -p ld-10 logs <服務> 看是哪個服務出問題`)

test('up --wait 成功，migration 都套用了：POST /orders 回 201', async () => {
  needUp()
  const n = compose(['exec', '-T', 'db', 'psql', '-U', 'cafe', '-d', 'cafe', '-Atc', 'SELECT count(*) FROM pgmigrations'])
  assert.equal(n.stdout, '2', `pgmigrations 裡應該有 2 筆紀錄（${n.stderr || n.stdout}）：要有一個步驟執行 node dist/migrate.js`)
  await waitHttp('http://127.0.0.1:18100/health/ready', 20_000)
  const qty = 1 + Math.floor(Math.random() * 5)
  const res = await fetch('http://127.0.0.1:18100/orders', { method: 'POST', body: JSON.stringify({ productId: 2, quantity: qty }) })
  const body = await res.json() as any
  assert.equal(res.status, 201, `POST /orders 回 ${res.status}：${JSON.stringify(body)}`)
  assert.equal(body.total, 110 * qty, '拿鐵 110 元的訂單金額不對')
})

test('migration 是獨立的步驟（一次性服務或 api 的 pre_start），不塞在 api 的啟動指令裡', () => {
  needUp()
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  const api = cfg.services.api
  assert.ok(!mentionsMigrate(api.command) && !mentionsMigrate(api.entrypoint), '不要把 migration 寫進 api 的 command：api 擴展成好幾份時每一份都會跑，migration 失敗時 api 會一直重啟。改成一次性服務或 pre_start')
  const hook = (api.pre_start ?? []).some((s: any) => mentionsMigrate(s.command))
  const oneShot = Object.entries(cfg.services).some(([name, s]: [string, any]) => name !== 'api' && mentionsMigrate(s.command))
  assert.ok(hook || oneShot, '找不到執行 node dist/migrate.js 的地方：加一個一次性服務（command: ["node", "dist/migrate.js"]），或寫在 api 的 pre_start')
})

test('一次性服務跑完是 exited (0)、沒被重啟過，而且 api 在它結束之後才啟動', () => {
  needUp()
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  const entry = Object.entries(cfg.services).find(([name, s]: [string, any]) => name !== 'api' && mentionsMigrate(s.command))
  // 不管哪種做法：最後一個 migration 套用的時間（資料庫的時鐘，UTC）要早於 api 啟動
  const last = compose(['exec', '-T', 'db', 'psql', '-U', 'cafe', '-d', 'cafe', '-Atc',
    `SELECT to_char(max(run_on) AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM pgmigrations`]).stdout
  const apiStarted = container('api')?.State.StartedAt
  assert.ok(last && apiStarted && new Date(apiStarted) > new Date(last), `api 在 ${apiStarted} 啟動，最後一個 migration 在 ${last || '（沒有）'} 才套用：migration 還沒跑完 api 就在接請求了`)
  if (!entry) {
    // 用 pre_start：Compose 保證 hook 以 exit 0 結束之後才啟動 api
    assert.ok((cfg.services.api.pre_start ?? []).some((s: any) => mentionsMigrate(s.command)), '沒有一次性服務也沒有 pre_start')
    return
  }
  const [name] = entry
  const m = container(name), api = container('api')
  assert.ok(m, `找不到 ${name} 的容器`)
  assert.equal(m.State.Status, 'exited', `${name} 的狀態是 ${m.State.Status}：一次性服務跑完要停在 exited，restart 要寫 "no"（加引號）`)
  assert.equal(m.State.ExitCode, 0, `${name} 的結束碼是 ${m.State.ExitCode}：docker compose -p ld-10 logs ${name} 看錯誤`)
  assert.equal(m.RestartCount, 0, `${name} 被重啟了 ${m.RestartCount} 次：一次性服務不能設 restart: always／unless-stopped`)
  const cond = cfg.services.api.depends_on?.[name]?.condition
  assert.equal(cond, 'service_completed_successfully', `api 對 ${name} 的條件是 ${cond ?? '（沒有）'}：要 service_completed_successfully，才會等它跑完而且 exit 0`)
  assert.ok(new Date(api.State.StartedAt) > new Date(m.State.FinishedAt), `api 在 ${api.State.StartedAt} 啟動，比 ${name} 結束（${m.State.FinishedAt}）還早：migration 還沒跑完 api 就在接請求了`)
})
