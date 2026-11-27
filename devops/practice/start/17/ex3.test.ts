// 練習 3：migrate.sh 等不到鎖就放棄（lock_timeout）、用退避重試，最多 5 次
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { runner } from 'node-pg-migrate'
import { NAME, admin, exec, freshDb, sleep, startPg, stopPg } from './pg-test.ts'

const dir = join(import.meta.dirname, 'locks')
const silent = { info() {}, warn() {}, error() {}, debug() {} }

// PostgreSQL 的 log 裡「等鎖逾時」的錯誤，回傳每一筆的時間（毫秒）
// 非同步讀 docker logs：同步執行會卡住整個程序，模擬 app 的請求延遲就量不準
async function lockTimeouts() {
  const r = await exec('docker', ['logs', NAME], { cwd: dir, env: {}, timeout: 30_000 })
  return (r.stdout + '\n' + r.stderr).split('\n')
    .filter(l => l.includes('canceling statement due to lock timeout'))
    .map(l => Date.parse(l.slice(0, 23).replace(' ', 'T') + 'Z'))
}

// 準備資料庫：套用 001，開一個交易讀 orders 不結束（拿著 ACCESS SHARE 鎖），模擬一份跑很久的報表
async function setup(db: string) {
  const databaseUrl = await freshDb(db)
  await runner({ databaseUrl, dir: join(dir, 'migrations'), direction: 'up', migrationsTable: 'pgmigrations', file: '001_orders', logger: silent })
  const holder = new pg.Client({ connectionString: databaseUrl })
  await holder.connect()
  await holder.query('BEGIN')
  await holder.query('SELECT count(*) FROM orders')
  return { databaseUrl, holder }
}

before(startPg)
after(stopPg)

test('長交易拿著 orders 的鎖時：app 的查詢延遲低於 4 秒，migrate.sh 等鎖逾時後重試，最後成功', async () => {
  const { databaseUrl, holder } = await setup('locks_a')
  const before = (await lockTimeouts()).length
  // 模擬 app：每 100 毫秒查一筆訂單（GET /orders/:id），記下每個請求花多久
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 })
  const latencies: number[] = [], pending: Promise<void>[] = []
  let running = true
  const app = (async () => {
    while (running) {
      const t = Date.now()
      pending.push(pool.query('SELECT id, total FROM orders WHERE id = $1', [1 + Math.floor(Math.random() * 1000)])
        .then(() => { latencies.push(Date.now() - t) }, () => { latencies.push(Date.now() - t) }))
      await sleep(100)
    }
  })()
  // 報表至少跑 8 秒，而且要等 migrate.sh 至少放棄過一次才結束（最多 30 秒）
  const started = Date.now()
  const release = (async () => {
    while (Date.now() - started < 30_000 && (Date.now() - started < 8_000 || (await lockTimeouts()).length === before)) await sleep(500)
    await holder.query('COMMIT')
    await holder.end()
  })()
  const r = await exec('sh', ['migrate.sh'], { cwd: dir, env: { DATABASE_URL: databaseUrl }, timeout: 90_000 })
  await release
  await sleep(500)
  running = false
  await app
  await Promise.all(pending)
  await pool.end()
  const worst = Math.max(...latencies)
  assert.ok(worst < 4_000, `app 的請求最久等了 ${(worst / 1000).toFixed(1)} 秒：ALTER 在等鎖時，後面的查詢都排在它後面。讓 migration 最多等 3 秒就放棄（lock_timeout）`)
  assert.equal(r.code, 0, `migrate.sh 沒有成功（exit ${r.code}）：${(r.stderr || r.stdout).slice(-600)}`)
  const n = (await lockTimeouts()).length - before
  assert.ok(n >= 1, 'PostgreSQL 的 log 裡沒有 lock timeout：migration 要設定 lock_timeout，等不到鎖就放棄再重試')
  const col = await admin(`SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'note'`, 'locks_a')
  assert.equal(col.rowCount, 1, 'migrate.sh 結束了，可是 orders 沒有 note 欄位：002 沒有套用')
})

test('鎖一直拿不到時：最多試 5 次、每次間隔越來越長，然後以非 0 結束', async () => {
  const { databaseUrl, holder } = await setup('locks_b')
  const before = (await lockTimeouts()).length
  // 在 PATH 最前面放一個 sleep：記下每次等幾秒再交給系統的 sleep，量的是腳本自己等的時間，不受 npx 啟動快慢影響
  const shim = mkdtempSync(join(tmpdir(), 'ld-17-sleep-'))
  const log = join(shim, 'sleeps.log')
  writeFileSync(join(shim, 'sleep'), `#!/bin/sh\necho "$1" >> '${log}'\nexec /bin/sleep "$@"\n`)
  chmodSync(join(shim, 'sleep'), 0o755)
  const r = await exec('sh', ['migrate.sh'], { cwd: dir, env: { DATABASE_URL: databaseUrl, PATH: `${shim}:${process.env.PATH}` }, timeout: 120_000 })
  await holder.query('ROLLBACK')
  await holder.end()
  let sleeps: number[] = []
  try { sleeps = readFileSync(log, 'utf8').trim().split('\n').map(parseFloat) } catch {}
  rmSync(shim, { recursive: true, force: true })
  assert.notEqual(r.code, null, 'migrate.sh 120 秒內沒有結束：重試要有上限（最多 5 次），不然部署會永遠卡在這一步')
  assert.notEqual(r.code, 0, 'migration 根本沒有套用，migrate.sh 卻以 exit 0 結束：放棄時要 exit 1，部署流程才會停下來')
  const times = (await lockTimeouts()).slice(before)
  assert.ok(times.length >= 2 && times.length <= 5, `PostgreSQL 記到 ${times.length} 次 lock timeout：鎖拿不到時要重試，總共最多 5 次`)
  assert.ok(sleeps.length >= 1, '重試之前沒有用 sleep 等一下：立刻重試等於一直插隊，每次又讓 app 的查詢多等一個 lock_timeout')
  assert.ok(sleeps.length >= 2 && sleeps.at(-1)! > sleeps[0], `每次重試前等的秒數是 ${sleeps.join('、')}，沒有越來越長：用退避（例如每次等待時間加倍：1、2、4、8 秒），給卡住的交易時間結束`)
})
