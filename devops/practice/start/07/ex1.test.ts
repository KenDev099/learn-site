// 練習 1：db-up.sh 用具名 volume 保存 PostgreSQL 的資料，密碼從 PGPASS 來，port 只開在 127.0.0.1:18070
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { docker, inspect, removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-07-db', VOLUME = 'ld-07-pgdata'
const PGPASS = randomBytes(12).toString('hex')   // 每次不同：寫死在腳本裡的密碼一定對不上
const SECRET = randomBytes(8).toString('hex')
let c: any = null, firstError = ''

const clean = () => { removeContainers(NAME); docker('volume', 'rm', '-f', VOLUME) }

// 執行 db-up.sh，等到能用 PGPASS 從 127.0.0.1:18070 登入；回傳連線好的 client 或錯誤訊息
async function up(): Promise<pg.Client | string> {
  const r = run('sh', ['db-up.sh'], { cwd: dir, env: { PGPASS }, timeout: 180_000 })
  if (r.code === null) return 'sh db-up.sh 180 秒都沒有結束：docker run 要加 -d 在背景執行'
  if (r.code !== 0) return `sh db-up.sh 失敗（結束碼 ${r.code}）：${r.stderr || r.stdout}`
  const end = Date.now() + 60_000
  let last = ''
  while (Date.now() < end) {
    const client = new pg.Client({ host: '127.0.0.1', port: 18070, user: 'postgres', password: PGPASS, database: 'postgres', connectionTimeoutMillis: 2_000 })
    try { await client.connect(); return client } catch (e) { last = (e as Error).message; await client.end().catch(() => {}) }
    if (inspect(NAME)?.State.Running === false) {
      const logs = docker('logs', '--tail', '8', NAME)
      return `容器 ld-07-db 啟動後就結束了，docker logs 最後幾行：\n${(logs.stderr || logs.stdout)}`
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return `60 秒內無法用 PGPASS 的密碼從 127.0.0.1:18070 登入：${last}`
}

before(async () => {
  requireDocker()
  clean()
  const first = await up()
  c = inspect(NAME)
  if (typeof first === 'string') { firstError = first; return }
  await first.query('CREATE TABLE note (body text)')
  await first.query('INSERT INTO note VALUES ($1)', [SECRET])
  await first.end()
})
after(clean)

test('容器 ld-07-db 用 postgres:18.6-alpine3.24，port 只發布在 127.0.0.1:18070', () => {
  assert.ok(c, '找不到容器 ld-07-db：docker run 要加 --name ld-07-db，而且不要加 --rm')
  assert.match(c.Config.Image, /^postgres:18\.6-alpine3\.24(@sha256:[0-9a-f]{64})?$/, `映像用 postgres:18.6-alpine3.24（可以再接 @sha256:…），現在是 ${c.Config.Image}`)
  assert.ok(c.Config.Env.includes('PG_VERSION=18.6'), '映像裡的 PostgreSQL 不是 18.6：@sha256: 後面接的 digest 要是 postgres:18.6-alpine3.24 的')
  const b = c.HostConfig.PortBindings?.['5432/tcp']
  assert.ok(b?.length, '容器的 5432 沒有發布出來：-p 127.0.0.1:18070:5432')
  const all = Object.values(c.HostConfig.PortBindings ?? {}).flat() as any[]
  assert.ok(all.every(x => x.HostIp === '127.0.0.1'), '有 port 發布在 0.0.0.0（沒寫主機 IP 就是 0.0.0.0），同一個網路的人都能連你的資料庫：只寫一個 -p 127.0.0.1:18070:5432')
  assert.deepEqual(b.map((x: any) => x.HostPort), ['18070'], '主機這端的 port 是 18070')
})

test('用 PGPASS 的密碼登得進去', () => {
  assert.equal(firstError, '', `${firstError}\n密碼要寫成 -e POSTGRES_PASSWORD="$PGPASS"，不能寫死`)
})

test('密碼錯的連線會被拒絕', async () => {
  assert.equal(firstError, '', '第一次就沒啟動成功：先讓前面的測試通過')
  const client = new pg.Client({ host: '127.0.0.1', port: 18070, user: 'postgres', password: PGPASS + 'x', database: 'postgres', connectionTimeoutMillis: 5_000 })
  const ok = await client.connect().then(() => true, () => false)
  await client.end().catch(() => {})
  assert.equal(ok, false, '用錯的密碼也登得進去：不要用 POSTGRES_HOST_AUTH_METHOD=trust，密碼用 -e POSTGRES_PASSWORD="$PGPASS"')
})

test('資料放在具名 volume ld-07-pgdata，掛在 /var/lib/postgresql', () => {
  assert.ok(c, '容器不存在：先讓第一個測試通過')
  const m = c.Mounts.find((m: any) => m.Name === VOLUME)
  assert.ok(m, `沒有掛 volume ${VOLUME}（目前的掛載：${c.Mounts.map((m: any) => `${m.Name?.slice(0, 12) ?? m.Source}→${m.Destination}`).join('、') || '無'}）：-v ${VOLUME}:/var/lib/postgresql`)
  assert.equal(m.Type, 'volume', '要用具名 volume，不是 bind mount')
  assert.equal(m.Destination, '/var/lib/postgresql', `掛載點是 ${m.Destination}：postgres 18 起資料在 /var/lib/postgresql/18/docker，要掛上一層的 /var/lib/postgresql（舊教學的 /var/lib/postgresql/data 是 17 以前的寫法）`)
})

test('刪掉容器（docker rm -f -v）再執行一次 db-up.sh，資料還在', async () => {
  assert.equal(firstError, '', '第一次就沒啟動成功：先讓前面的測試通過')
  removeContainers(NAME)   // -v 只會刪匿名 volume，具名 volume 留著
  const again = await up()
  assert.ok(typeof again !== 'string', `第二次執行 db-up.sh 後連不上：${again}`)
  try {
    const r = await again.query('SELECT body FROM note').catch(e => ({ rows: [], error: (e as Error).message }))
    assert.deepEqual(r.rows.map((x: any) => x.body), [SECRET], '重建容器後資料不見了：資料寫在容器的可寫層或匿名 volume，刪容器就跟著刪了。改用具名 volume 掛在 /var/lib/postgresql')
  } finally { await again.end() }
})
