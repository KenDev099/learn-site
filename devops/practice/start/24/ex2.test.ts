// 練習 2：restore-drill.sh 在全新的臨時容器裡還原、驗證並量出 RTO；壞掉的備份一定要判失敗
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docker, inspect, run } from '../../helpers/docker.ts'
import { DB, DRILL, counts, downDb, psql, upDb } from './db-test.ts'

const dir = import.meta.dirname
const out = mkdtempSync(join(tmpdir(), 'ld24-drill-'))
const drill = (dump: string) => run('bash', ['restore-drill.sh', dump], { cwd: dir, timeout: 240_000 })

// 測試自己做一份標準的備份（不依賴練習 1）：-Z 0 不壓縮
function makeBackup(name: string) {
  const r = docker('exec', DB, 'pg_dump', '-U', 'postgres', '-d', 'cafe', '-Fc', '-Z', '0', '-f', '/tmp/t.dump')
  if (r.code !== 0) throw new Error(`測試做備份失敗：${r.stderr}`)
  docker('cp', `${DB}:/tmp/t.dump`, join(out, `${name}.dump`))
  writeBackup(name, readFileSync(join(out, `${name}.dump`)), counts())
  return join(out, `${name}.dump`)
}
function writeBackup(name: string, bytes: Buffer, tables: object) {
  writeFileSync(join(out, `${name}.dump`), bytes)
  writeFileSync(join(out, `${name}.sha256`), `${createHash('sha256').update(bytes).digest('hex')}  ${name}.dump\n`)
  writeFileSync(join(out, `${name}.manifest.json`), JSON.stringify({ dump: `${name}.dump`, tables }))
}
const databases = () => psql('SELECT string_agg(datname, \',\' ORDER BY datname) FROM pg_database', 'postgres')
const noDrillLeft = (label: string) =>
  assert.equal(docker('ps', '-a', '-q', '--filter', `name=^${DRILL}$`).stdout, '', `${label}：演練結束後臨時容器 ${DRILL} 還在：用 trap 在結束時（成功或失敗）docker rm -f 它`)

let good = '', bitrot = '', mismatch = '', broken = '', roles = ''

before(async () => {
  await upDb()
  psql(`INSERT INTO customers (name) VALUES ('ld24-marker-AAAA')`)
  good = makeBackup('cafe-20261101T030000Z')
  // 位元腐壞：改一個 byte，格式仍然合法、列數也一樣，只有校驗和看得出來
  const bytes = readFileSync(good)
  const at = bytes.indexOf('ld24-marker-AAAA')
  if (at < 0) throw new Error('測試找不到標記：備份格式和預期不同')
  writeBackup('cafe-20261101T040000Z', bytes, JSON.parse(readFileSync(good.replace(/\.dump$/, '.manifest.json'), 'utf8')).tables)
  bitrot = join(out, 'cafe-20261101T040000Z.dump')
  bytes[at + 15] = 'B'.charCodeAt(0)
  writeFileSync(bitrot, bytes)                          // 只換 .dump，.sha256 還是原本的
  // manifest 說 orders 多一列
  const tables = counts()
  writeBackup('cafe-20261101T050000Z', readFileSync(good), { ...tables, orders: tables.orders + 1 })
  mismatch = join(out, 'cafe-20261101T050000Z.dump')
  // 格式、校驗和、列數都對，但資料本身壞了：有一張訂單的總額跟明細加總不一樣，只有煙霧測試看得出來
  psql(`UPDATE orders SET total = total + 1 WHERE id = (SELECT min(id) FROM orders)`)
  broken = makeBackup('cafe-20261101T070000Z')
  psql(`UPDATE orders SET total = total - 1 WHERE id = (SELECT min(id) FROM orders)`)
  // 正式環境有 app 專用的角色和權限：pg_dump 只匯出 GRANT，不匯出角色本身
  psql(`CREATE ROLE ld24_app; GRANT SELECT ON orders TO ld24_app;`)
  roles = makeBackup('cafe-20261101T060000Z')
  psql(`REVOKE SELECT ON orders FROM ld24_app; DROP ROLE ld24_app;`)
  // 備份之後才寫入的資料：還原到正式的 db 會把它蓋掉
  psql(`INSERT INTO customers (name) VALUES ('ld24-after-backup')`)
}, { timeout: 300_000 })
after(() => { downDb(); rmSync(out, { recursive: true, force: true }) })

test('好的備份：在臨時容器還原、驗證通過，印出 {"ok":true,"rto_seconds":…}，不動到正式的 db', () => {
  const prod = inspect(DB), dbs = databases()
  const r = drill(good)
  assert.equal(r.code, 0, `bash restore-drill.sh 失敗（結束碼 ${r.code}）：${r.stderr || r.stdout}`.slice(0, 800))
  const last = r.stdout.split('\n').at(-1) ?? ''
  let res: any
  try { res = JSON.parse(last) } catch { assert.fail(`最後一行要是 JSON，例如 {"ok":true,"rto_seconds":7}，現在是：${last}`) }
  assert.equal(res.ok, true, '成功時 ok 要是 true')
  assert.ok(typeof res.rto_seconds === 'number' && res.rto_seconds > 0, `rto_seconds 要是從開始到驗證完成的秒數（大於 0 的數字），現在是 ${res.rto_seconds}`)
  noDrillLeft('好的備份')
  const now = inspect(DB)
  assert.ok(now && now.Id === prod.Id && now.State.StartedAt === prod.State.StartedAt, `正式的 ${DB} 被重建或重啟了：演練只能用另一個臨時容器 ${DRILL}`)
  assert.equal(psql(`SELECT count(*) FROM customers WHERE name = 'ld24-after-backup'`), '1', `正式的 db 少了備份之後才寫入的資料：你把備份還原進了正式的 ${DB}！演練要用全新的臨時容器 ${DRILL}`)
  assert.equal(databases(), dbs, `正式的 ${DB} 多了或少了資料庫：演練不能在正式的容器裡建資料庫，要用臨時容器 ${DRILL}`)
})

test('備份檔被改了一個 byte（格式仍然合法、列數一樣）：要 exit ≠ 0', () => {
  const r = drill(bitrot)
  assert.notEqual(r.code, 0, '演練卻成功了：還原之前先用 .sha256 驗證檔案（sha256sum -c），不符就停')
  noDrillLeft('被改過的備份')
})

test('還原出來的列數跟 manifest 不一樣：要 exit ≠ 0', () => {
  const r = drill(mismatch)
  assert.notEqual(r.code, 0, '演練卻成功了：用 counts.sql 數還原後的列數，跟 manifest 的 tables 比對（jq -e）')
  noDrillLeft('列數不符')
})

test('還原成功、列數也對，但資料有問題（訂單總額跟明細對不起來）：要 exit ≠ 0', () => {
  const r = drill(broken)
  assert.notEqual(r.code, 0, '演練卻成功了：還原、比對列數之後，還要對還原出來的資料庫跑 smoke.sql（psql -v ON_ERROR_STOP=1），它失敗時演練也要失敗')
  noDrillLeft('煙霧測試失敗')
})

test('還原過程有錯誤（備份裡的 GRANT 指向不存在的角色）：要 exit ≠ 0', () => {
  const r = drill(roles)
  assert.notEqual(r.code, 0, '演練卻成功了：pg_restore 預設遇到錯誤會繼續做完；要加 --exit-on-error，而且不能用 || true 吞掉結束碼。還原到一半的資料庫不能算成功')
  noDrillLeft('還原有錯誤')
})
