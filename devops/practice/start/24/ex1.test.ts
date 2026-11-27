// 練習 1：backup.sh 產生可以驗證的備份；任何失敗都要 exit ≠ 0、不留半成品、LATEST 不變
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docker, run } from '../../helpers/docker.ts'
import { DB, counts, downDb, psql, upDb } from './db-test.ts'

const dir = import.meta.dirname
const temps: string[] = []
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'ld24-')); temps.push(d); return d }
const backup = (offsite: string, env: Record<string, string> = {}) =>
  run('bash', ['backup.sh'], { cwd: dir, env: { OFFSITE_DIR: offsite, ...env }, timeout: 180_000 })
const NAME = /^cafe-(\d{8}T\d{6}Z)\.dump$/
const listing = (d: string) => readdirSync(d).sort()
const latest = (d: string) => existsSync(join(d, 'LATEST')) ? readFileSync(join(d, 'LATEST'), 'utf8').trim() : null

// 假的 docker：碰到 pg_dump 時，模擬「傳到一半斷線」或「回報成功但內容是壞的」，其他指令照常交給真的 docker
function fakeDocker(mode: 'cut' | 'garbage') {
  const real = run('sh', ['-c', 'command -v docker']).stdout
  const bin = temp()
  writeFileSync(join(bin, 'docker'), `#!/bin/sh
case "$*" in *pg_dump*)
  ${mode === 'cut'
    ? `"${real}" "$@" > "${bin}/full"; n=$(wc -c < "${bin}/full"); head -c $((n * 6 / 10)) "${bin}/full"; echo "pg_dump: error: connection to server lost" >&2; exit 1`
    : `printf 'PGDMP this is not a real archive'; exit 0`} ;;
esac
exec "${real}" "$@"
`, { mode: 0o755 })
  return { PATH: `${bin}:${process.env.PATH}` }
}

before(upDb, { timeout: 300_000 })
after(() => { downDb(); for (const d of temps) { try { chmodSync(d, 0o755) } catch {} rmSync(d, { recursive: true, force: true }) } })

let good = ''   // 第一個測試產生的備份資料夾，後面的失敗測試從這個狀態開始

test('正常備份：.dump、.sha256、.manifest.json 齊全且正確，LATEST 指向它，最後一行印出 JSON', () => {
  const offsite = temp()
  const want = counts()
  const r = backup(offsite)
  assert.equal(r.code, 0, `bash backup.sh 失敗（結束碼 ${r.code}）：${r.stderr}`.slice(0, 800))
  const dumps = listing(offsite).filter(f => NAME.test(f))
  assert.equal(dumps.length, 1, `OFFSITE_DIR 裡要有一個 cafe-<UTC 時間>.dump（例如 cafe-20261101T030000Z.dump），現在有：${listing(offsite).join('、') || '（空的）'}`)
  const dump = dumps[0], base = dump.replace(/\.dump$/, '')
  const stamp = NAME.exec(dump)![1]
  const t = Date.parse(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`)
  assert.ok(Math.abs(Date.now() - t) < 5 * 60_000, `檔名的時間 ${stamp} 跟現在差太多：用 date -u 產生 UTC 時間`)
  assert.deepEqual(listing(offsite), [base + '.dump', base + '.manifest.json', base + '.sha256', 'LATEST'].sort(),
    `OFFSITE_DIR 裡只能有這 4 個檔案（暫存檔要改名或刪掉）：${listing(offsite).join('、')}`)
  const bytes = readFileSync(join(offsite, dump))
  const sha = readFileSync(join(offsite, base + '.sha256'), 'utf8').trim()
  assert.equal(sha, `${createHash('sha256').update(bytes).digest('hex')}  ${dump}`, `${base}.sha256 要是 sha256sum 的格式「<64 位 hex>  ${dump}」（兩個空白，只寫檔名不寫路徑），而且雜湊值要對`)
  const list = run('docker', ['exec', '-i', DB, 'pg_restore', '--list'], { input: bytes as any })
  assert.equal(list.code, 0, `pg_restore --list 讀不了這個檔：要用 pg_dump -Fc（custom 格式）。${list.stderr}`.slice(0, 500))
  assert.match(list.stdout, /TABLE DATA public orders /, '備份裡沒有 orders 的資料')
  let manifest: any
  try { manifest = JSON.parse(readFileSync(join(offsite, base + '.manifest.json'), 'utf8')) } catch (e) { assert.fail(`${base}.manifest.json 不是合法的 JSON：${(e as Error).message}`) }
  assert.deepEqual(manifest.tables, want, `manifest 的 tables 要是 counts.sql 印出來的各表列數：${JSON.stringify(want)}`)
  assert.equal(latest(offsite), dump, `LATEST 的內容要是剛做好的備份檔名 ${dump}`)
  const last = r.stdout.split('\n').at(-1) ?? ''
  let out: any
  try { out = JSON.parse(last) } catch { assert.fail(`最後一行要印一行 JSON，例如 {"file":"${dump}","bytes":12345,"seconds":2}，現在是：${last}`) }
  assert.equal(out.bytes, bytes.length, `JSON 的 bytes 要是備份檔的大小 ${bytes.length}`)
  assert.ok(typeof out.seconds === 'number' && out.seconds >= 0, 'JSON 的 seconds 要是耗時（秒，數字）')
  good = offsite
})

// 每個失敗情境都從「已經有一份好備份」開始：失敗後檔案清單與 LATEST 都不能變
function mustFail(label: string, env: Record<string, string>, hint: string, offsite = good) {
  assert.ok(good, '先通過第一個測試')
  const before = listing(offsite), was = latest(offsite)
  const r = backup(offsite, env)
  assert.notEqual(r.code, 0, `${label}：backup.sh 卻以 exit 0 結束。${hint}`)
  assert.deepEqual(listing(offsite), before, `${label}：失敗後 OFFSITE_DIR 多了或少了檔案（${listing(offsite).filter(f => !before.includes(f)).join('、')}）：先寫暫存檔，用 trap 在結束時清掉，全部成功才改名`)
  assert.equal(latest(offsite), was, `${label}：失敗了 LATEST 卻被改了`)
}

test('資料庫名稱打錯（DB_NAME=nope）：失敗、不留檔案、LATEST 不變', () => {
  mustFail('DB_NAME=nope', { DB_NAME: 'nope' }, 'pg_dump 失敗了，腳本要跟著失敗：set -euo pipefail')
})

test('pg_dump 傳到一半斷線（已經寫出 60%）：失敗、不留檔案、LATEST 不變', () => {
  mustFail('pg_dump 中途失敗', fakeDocker('cut'), '管線前段失敗、後段成功時，沒有 pipefail 整條管線就算成功；而且 pg_restore --list 只讀檔頭的目錄，讀得出來不代表資料完整')
})

test('pg_dump 回報成功但內容是壞的：驗證要擋下來，LATEST 不變', () => {
  mustFail('內容是壞的', fakeDocker('garbage'), '改名、更新 LATEST 之前，先在容器裡用 pg_restore --list 讀一次')
})

test('OFFSITE_DIR 寫不進去（唯讀）：失敗、LATEST 不變', () => {
  assert.ok(good, '先通過第一個測試')
  chmodSync(good, 0o555)
  try { mustFail('OFFSITE_DIR 唯讀', {}, '寫檔失敗要讓腳本失敗') } finally { chmodSync(good, 0o755) }
})

test('資料庫停了：失敗、不留檔案、LATEST 不變', () => {
  assert.ok(good, '先通過第一個測試')
  docker('stop', DB)
  try { mustFail('db 停止', {}, 'docker exec 失敗了，腳本要跟著失敗') } finally { docker('start', DB) }
})
