// 練習 1：migration 是部署前的一次性步驟（用 cafe_migrator），api 用只有資料權限的 cafe_app
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const env = { PGPASS: randomBytes(12).toString('hex'), MIGRATOR_PASS: randomBytes(12).toString('hex'), APP_PASS: randomBytes(12).toString('hex') }
const compose = (args: string[], timeout = 180_000) => run('docker', ['compose', '-p', 'ld-17', ...args], { cwd: dir, env, timeout })
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
// 用超級使用者在 db 容器裡查（只用來檢查，app 和 migration 都不該用它）
const admin = (sql: string) => compose(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'cafe', '-v', 'ON_ERROR_STOP=1', '-Atc', sql])
// 用 cafe_app 的帳號、走 TCP 連線，跟 api 一樣
const asApp = (sql: string) => compose(['exec', '-T', '-e', `PGPASSWORD=${env.APP_PASS}`, 'db', 'psql', '-h', '127.0.0.1', '-U', 'cafe_app', '-d', 'cafe', '-v', 'ON_ERROR_STOP=1', '-Atc', sql])
let up = { code: 1 as number | null, out: '' }

before(() => {
  requireDocker()
  compose(['down', '-v', '--remove-orphans'])
  const r = compose(['up', '-d', '--wait', '--wait-timeout', '90', '--build'], 600_000)
  up = { code: r.code, out: r.stderr + '\n' + r.stdout }
})
after(() => compose(['down', '-v', '--remove-orphans']))

const needUp = () => assert.equal(up.code, 0, `docker compose -p ld-17 up -d --wait --build 失敗：\n${tail(up.out)}\n用 docker compose -p ld-17 ps -a 和 docker compose -p ld-17 logs migrate api 看是哪個服務出問題`)

test('up --wait 成功：migration 套用了 2 個，api 的 POST /orders 回 201', async () => {
  needUp()
  const n = admin('SELECT count(*) FROM pgmigrations')
  assert.equal(n.stdout, '2', `pgmigrations 應該有 2 筆（${n.stderr || n.stdout}）：migrate 服務要執行 node dist/migrate.js`)
  await waitHttp('http://127.0.0.1:18170/health/ready', 20_000)
  const res = await fetch('http://127.0.0.1:18170/orders', { method: 'POST', body: JSON.stringify({ productId: 2, quantity: 2 }) })
  const body = await res.text()
  assert.equal(res.status, 201, `POST /orders 回 ${res.status}：${body}\npermission denied 代表 cafe_app 對 migration 建的表沒有權限：在 db/02-grants.sql 用 ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator 讓之後建的表自動給 cafe_app 權限`)
})

test('api 用 cafe_app 連線（GET /debug/db-user），表的擁有者是 cafe_migrator', async () => {
  needUp()
  const res = await waitHttp('http://127.0.0.1:18170/debug/db-user', 20_000)
  assert.equal(res.status, 200, `GET /debug/db-user 回 ${res.status}：api 要設定環境變數 DEBUG_ENDPOINTS: "1"`)
  const { user } = await res.json() as any
  assert.equal(user, 'cafe_app', `api 用 ${user} 連資料庫：api 的 DATABASE_URL 要用 cafe_app（密碼 \${APP_PASS}）。能改 schema 的帳號只給 migration 用`)
  const owners = admin(`SELECT string_agg(DISTINCT tableowner, ',') FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('orders', 'products')`)
  assert.equal(owners.stdout, 'cafe_migrator', `orders、products 的擁有者是 ${owners.stdout || '（沒有這兩張表）'}：migrate 要用 cafe_migrator（密碼 \${MIGRATOR_PASS}）執行，不是 postgres 超級使用者`)
})

test('cafe_app 只能讀寫資料：不能建表、建 schema、TRUNCATE', () => {
  needUp()
  const create = asApp('CREATE TABLE ld17_probe (id int)')
  assert.notEqual(create.code, 0, 'cafe_app 建得了表：api 被 SQL injection 時，攻擊者也能改 schema。不要 GRANT CREATE（或 ALL）ON SCHEMA public 給 cafe_app')
  assert.match(create.stderr, /permission denied/, `cafe_app 建表失敗的原因應該是 permission denied，實際是：${create.stderr}`)
  const priv = admin(`SELECT has_database_privilege('cafe_app', 'cafe', 'CREATE'),
    has_table_privilege('cafe_app', 'orders', 'SELECT, INSERT, UPDATE, DELETE') AND has_table_privilege('cafe_app', 'products', 'SELECT, INSERT, UPDATE, DELETE'),
    has_table_privilege('cafe_app', 'orders', 'TRUNCATE') OR has_table_privilege('cafe_app', 'orders', 'TRIGGER') OR has_table_privilege('cafe_app', 'orders', 'REFERENCES') OR has_table_privilege('cafe_app', 'orders', 'MAINTAIN'),
    has_sequence_privilege('cafe_app', pg_get_serial_sequence('orders', 'id'), 'USAGE')`)
  const [dbCreate, dml, extra, seq] = priv.stdout.split('|')
  assert.equal(dbCreate, 'f', 'cafe_app 對資料庫 cafe 有 CREATE（可以建 schema）：不要 GRANT ALL ON DATABASE')
  assert.equal(dml, 't', 'cafe_app 對 orders、products 要有 SELECT、INSERT、UPDATE、DELETE')
  assert.equal(extra, 'f', 'cafe_app 對 orders 有 TRUNCATE／TRIGGER／REFERENCES／MAINTAIN：ALL 給太多了，只給 SELECT, INSERT, UPDATE, DELETE')
  assert.equal(seq, 't', 'cafe_app 對 orders 的序列沒有 USAGE：用 ALTER DEFAULT PRIVILEGES FOR ROLE cafe_migrator … GRANT USAGE, SELECT ON SEQUENCES，之後用 serial 或 nextval() 的表才能新增資料')
})

test('migrate 是獨立的一次性服務，不塞在 api 的啟動指令裡；再跑一次是 no-op', () => {
  needUp()
  const cfg = JSON.parse(compose(['config', '--format', 'json']).stdout)
  const api = cfg.services.api
  const mentions = (x: unknown) => /migrate/.test([x ?? ''].flat().join(' '))
  assert.ok(!mentions(api?.command) && !mentions(api?.entrypoint), '不要把 migration 寫進 api 的 command：每個副本都會跑、api 需要改 schema 的權限、migration 失敗時所有副本一起重啟')
  assert.ok(cfg.services.migrate && mentions(cfg.services.migrate.command), '要有一個叫 migrate 的服務，command 執行 node dist/migrate.js')
  assert.equal(api?.depends_on?.migrate?.condition, 'service_completed_successfully', 'api 對 migrate 的 depends_on 要用 condition: service_completed_successfully')
  const again = compose(['run', '--rm', 'migrate'])
  assert.equal(again.code, 0, `docker compose -p ld-17 run --rm migrate 失敗：${tail(again.stderr + '\n' + again.stdout)}`)
  assert.match(again.stdout + again.stderr, /套用了 0 個|No migrations to run/, '再跑一次應該沒有要套用的 migration')
  assert.equal(admin('SELECT count(*) FROM pgmigrations').stdout, '2', '再跑一次之後 pgmigrations 還是 2 筆')
})

test('全新的資料庫上同時啟動兩個 migrate：兩個都 exit 0，每個 migration 只套用一次', async () => {
  needUp()
  compose(['down', '-v', '--remove-orphans'])
  const db = compose(['up', '-d', '--wait', '--wait-timeout', '90', 'db'])
  assert.equal(db.code, 0, `只啟動 db 失敗：${tail(db.stderr)}`)
  const runOne = () => new Promise<{ code: number | null, out: string }>(resolve => {
    const p = spawn('docker', ['compose', '-p', 'ld-17', 'run', '--rm', '--no-deps', 'migrate'], { cwd: dir, env: { ...process.env, ...env } })
    let out = ''
    p.stdout.on('data', d => out += d)
    p.stderr.on('data', d => out += d)
    p.on('close', code => resolve({ code, out }))
  })
  const [a, b] = await Promise.all([runOne(), runOne()])
  assert.equal(a.code, 0, `第一個 migrate 失敗：${tail(a.out)}`)
  assert.equal(b.code, 0, `第二個 migrate 失敗：${tail(b.out)}`)
  const rows = admin('SELECT count(*), count(DISTINCT name) FROM pgmigrations')
  assert.equal(rows.stdout, '2|2', `pgmigrations 是 ${rows.stdout}（筆數|不重複的名稱數），應該是 2|2`)
})
