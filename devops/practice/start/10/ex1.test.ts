// 練習 1：compose.yaml 描述 db 和 api，一個指令啟動整套服務；down（不加 -v）再 up，資料還在
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
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '90', '--build'], 600_000)
  up = { code: r.code, out: r.stderr + '\n' + r.stdout }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `docker compose -p ld-10 up -d --wait --build 失敗：\n${tail(up.out)}\n用 docker compose -p ld-10 ps -a 和 docker compose -p ld-10 logs 看是哪個服務出問題`)

test('up --wait 成功，http://127.0.0.1:18100/health/ready 回 200（api 連得上 db）', async () => {
  needUp()
  const res = await waitHttp('http://127.0.0.1:18100/health/ready', 20_000)
  const body = await res.text()
  assert.equal(res.status, 200, `/health/ready 回 ${res.status}：${body}\n連不上資料庫：api 容器裡的 localhost 是 api 自己，DATABASE_URL 的主機要寫服務名稱 db`)
})

test('db 不發布任何 port；api 只發布在 127.0.0.1:18100', () => {
  needUp()
  const db = container('db'), api = container('api')
  const dbPorts = Object.values(db?.HostConfig.PortBindings ?? {}).flat().filter(Boolean)
  assert.deepEqual(dbPorts, [], 'db 發布了 port：api 在同一個網路裡用 db:5432 就連得到，資料庫不要對外發布（要看資料用 docker compose exec db psql -U cafe）')
  const b = api?.HostConfig.PortBindings?.['3000/tcp'] ?? []
  assert.deepEqual(b.map((x: any) => `${x.HostIp}:${x.HostPort}`), ['127.0.0.1:18100'], `api 的 3000 要發布成 "127.0.0.1:18100:3000"，現在是 ${JSON.stringify(b)}；沒寫 IP 會發布在 0.0.0.0，外面的人也連得到`)
})

test('db 有 healthcheck，api 用 depends_on 的 service_healthy 等它', () => {
  needUp()
  const db = container('db')
  const hc = [db?.Config.Healthcheck?.Test ?? []].flat().join(' ')
  assert.match(hc, /pg_isready/, `db 的 healthcheck 是「${hc || '（沒有）'}」：要用 pg_isready 檢查資料庫能不能接受連線，寫 true 之類的指令等於沒檢查`)
  assert.match(hc, /(-h|--host)[\s=]*(127\.0\.0\.1|localhost)\b/, 'pg_isready 要加 -h 127.0.0.1 走 TCP：不加時走 Unix socket，初始化用的暫時伺服器就會讓它太早回報 healthy')
  const l = run('docker', ['logs', db.Id]), bad = (l.stdout + '\n' + l.stderr).split('\n').find(x => /role ".*" does not exist/.test(x))
  assert.ok(!bad, `db 的 log 出現「${bad?.trim()}」：healthcheck 裡的 $POSTGRES_USER 被 Compose 在主機上先替換成空字串了，要寫 $$ 才會留給容器裡的 shell 展開`)
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  const cond = cfg.services.api?.depends_on?.db?.condition
  assert.equal(cond, 'service_healthy', `api 對 db 的 depends_on 條件是 ${cond ?? '（沒有）'}：只寫名稱只會等容器「啟動」，要寫 condition: service_healthy 才會等到資料庫就緒`)
})

test('密碼從 ${PGPASS} 帶入，不寫死在檔案裡', () => {
  needUp()
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  assert.equal(cfg.services.db?.environment?.POSTGRES_PASSWORD, PGPASS, 'db 的 POSTGRES_PASSWORD 要寫 ${PGPASS}（變數替換），密碼不能寫死在 compose.yaml 裡進 git')
  assert.ok(String(cfg.services.api?.environment?.DATABASE_URL ?? '').includes(`:${PGPASS}@`), 'api 的 DATABASE_URL 裡的密碼也要用 ${PGPASS}')
})

test('db 的資料放在具名 volume，掛在 /var/lib/postgresql', () => {
  needUp()
  const m = container('db')?.Mounts.find((x: any) => x.Destination.startsWith('/var/lib/postgresql'))
  assert.ok(m, 'db 沒有掛 volume：資料會留在容器的可寫層，down 之後就沒了')
  assert.equal(m.Type, 'volume', `db 掛的是 ${m.Type}，要用具名 volume（頂層 volumes: 宣告，服務裡寫 名稱:/var/lib/postgresql）`)
  assert.equal(m.Destination, '/var/lib/postgresql', `volume 掛在 ${m.Destination}：postgres 18 起要掛 /var/lib/postgresql`)
  assert.ok(!/^[0-9a-f]{64}$/.test(m.Name), 'db 用的是匿名 volume（一長串亂碼的名字）：在頂層 volumes: 宣告一個名字')
})

test('api 有記憶體上限、restart: unless-stopped、會輪替的 log', () => {
  needUp()
  const h = container('api')?.HostConfig
  assert.ok(h?.Memory > 0, 'api 沒有記憶體上限：用 deploy.resources.limits.memory 設定，避免記憶體洩漏拖垮整台主機')
  assert.equal(h.RestartPolicy.Name, 'unless-stopped', `api 的重啟策略是 ${h.RestartPolicy.Name || 'no'}，要 unless-stopped`)
  const { Type, Config } = h.LogConfig
  assert.ok(Type === 'local' || (Type === 'json-file' && Config['max-size']), `api 的 log driver 是 ${Type}，沒有輪替：改用 logging.driver: local，或 json-file 加上 options.max-size 和 max-file，不然 log 會塞滿磁碟`)
})

test('docker compose down（不加 -v）再 up，資料庫裡的資料還在', async () => {
  needUp()
  const mark = randomBytes(6).toString('hex')
  const psql = (sql: string) => compose(['exec', '-T', 'db', 'psql', '-U', 'cafe', '-d', 'cafe', '-Atc', sql])
  const w = psql(`CREATE TABLE IF NOT EXISTS ld10_probe (v text); INSERT INTO ld10_probe VALUES ('${mark}')`)
  assert.equal(w.code, 0, `寫不進資料庫（使用者和資料庫都要叫 cafe）：${w.stderr}`)
  const down = compose(['down'])
  assert.equal(down.code, 0, `docker compose down 失敗：${down.stderr}`)
  const again = compose(['up', '-d', '--wait', '--wait-timeout', '90'], 300_000)
  assert.equal(again.code, 0, `第二次 up 失敗：\n${tail(again.stderr)}`)
  const r = psql('SELECT v FROM ld10_probe')
  assert.ok(r.stdout.split('\n').includes(mark), `down 再 up 之後資料不見了（${r.stderr || r.stdout}）：資料要放在具名 volume 裡`)
})
