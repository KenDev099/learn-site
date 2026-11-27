// 練習 3：修好 broken/compose.yaml，up --wait 成功、/health/ready 200，而且不是靠刪掉檢查「修好」的
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { inspect, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = join(import.meta.dirname, 'broken')
const PGPASS = randomBytes(12).toString('hex')
const compose = (args: string[], timeout = 180_000) =>
  run('docker', ['compose', '-p', 'ld-10b', ...args], { cwd: dir, env: { PGPASS }, timeout })
const container = (service: string) => inspect(compose(['ps', '-aq', service]).stdout.split('\n')[0] || 'ld-10b-none')
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
let up = { code: 1 as number | null, out: '' }
let squatter: Server | undefined

before(async () => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  // 模擬主機上已經有一個程式（例如你自己裝的 PostgreSQL）占用了 127.0.0.1:18105
  squatter = createServer().listen(18105, '127.0.0.1')
  await new Promise(r => squatter!.once('listening', r).once('error', r))
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '90', '--build'], 600_000)
  up = { code: r.code, out: r.stderr + '\n' + r.stdout }
})
after(() => {
  squatter?.close()
  compose(['down', '-v', '--remove-orphans'])
})

const needUp = () => assert.equal(up.code, 0, `在 broken/ 裡 docker compose -p ld-10b up -d --wait --build 失敗：\n${tail(up.out)}`)

test('up --wait 成功，http://127.0.0.1:18102/health/ready 回 200', async () => {
  needUp()
  const res = await waitHttp('http://127.0.0.1:18102/health/ready', 20_000)
  assert.equal(res.status, 200, `/health/ready 回 ${res.status}：${await res.text()}`)
})

test('db 不發布 port（換一個號碼也不行）', () => {
  needUp()
  const ports = Object.values(container('db')?.HostConfig.PortBindings ?? {}).flat().filter(Boolean)
  assert.deepEqual(ports, [], '資料庫還是發布了 port：衝突的根本原因是資料庫根本不該發布，把 ports 整段拿掉')
})

test('db 的 healthcheck 還在、拿到容器裡的使用者和資料庫名稱，api 仍然等它 healthy', () => {
  needUp()
  const db = container('db')
  const hc = [db?.Config.Healthcheck?.Test ?? []].flat().join(' ')
  assert.match(hc, /pg_isready/, `db 的 healthcheck 是「${hc || '（沒有）'}」：把 healthcheck 刪掉或換成 true 不算修好，api 就沒辦法等資料庫就緒`)
  assert.equal(db.State.Health?.Status, 'healthy', `db 現在是 ${db.State.Health?.Status}`)
  const l = run('docker', ['logs', db.Id]), logs = l.stdout + '\n' + l.stderr
  const bad = logs.split('\n').find(l => /role ".*" does not exist/.test(l))
  assert.ok(!bad, `db 的 log 出現「${bad?.trim()}」：healthcheck 裡的 $POSTGRES_USER 被 Compose 在主機上先替換成空字串了，要寫 $$ 才會留給容器裡的 shell 展開`)
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  assert.equal(cfg.services.api?.depends_on?.db?.condition, 'service_healthy', 'api 要保留 depends_on: db: condition: service_healthy')
})

test('db 的 volume 掛在 /var/lib/postgresql', () => {
  needUp()
  const m = container('db')?.Mounts.find((x: any) => x.Type === 'volume' && !/^[0-9a-f]{64}$/.test(x.Name))
  assert.equal(m?.Destination, '/var/lib/postgresql', `具名 volume 掛在 ${m?.Destination ?? '（沒有）'}：postgres 18 起要掛 /var/lib/postgresql`)
})
