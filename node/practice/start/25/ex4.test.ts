import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { run } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }

// 把 run-report.sh 複製到暫存資料夾，tools/report.ts 用原始版本（改了 work/25/tools 也沒用），
// 放隨機的訂單和祕密，用 sh run-report.sh 執行。PATH 最前面放跑測試的這個 node，腳本裡寫 node 就會用到它
const REPORT = join(import.meta.dirname, '..', '..', 'start', '25', 'tools')
async function runReport(mode: string) {
  const dir = await tmpProject({})
  await cp(join(import.meta.dirname, 'run-report.sh'), join(dir, 'run-report.sh'))
  await cp(REPORT, join(dir, 'tools'), { recursive: true })
  const orders = Array.from({ length: 2 + Math.floor(Math.random() * 5) }, (_, i) => ({ id: i + 1, total: 70 + Math.floor(Math.random() * 300) }))
  const secret = `tok_${randomBytes(6).toString('hex')}`
  await cp(join(import.meta.dirname, 'data'), join(dir, 'data'), { recursive: true })
  await writeFile(join(dir, 'data', 'orders.json'), JSON.stringify(orders))
  await writeFile(join(dir, 'secret.env'), `SUPPLIER_TOKEN=${secret}\n`)
  const r = await run('sh', ['run-report.sh'], {
    cwd: dir,
    env: { REPORT_MODE: mode, PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? '') },
  })
  return { ...r, dir, orders, secret }
}

test('正常執行：結束碼 0，out/report.json 正確', opts, async () => {
  const r = await runReport('normal')
  const hint = r.stderr.includes("resource: 'out/")
    ? '。寫 out/ 被拒：out/ 在啟動時還不存在，--allow-fs-write=./out 只允許「out」這個路徑本身，要寫成 ./out/*（記得加引號）'
    : ''
  assert.equal(r.code, 0, `sh run-report.sh 失敗了${hint}。stderr：${r.stderr.slice(0, 600)}`)
  const report = JSON.parse(await readFile(join(r.dir, 'out', 'report.json'), 'utf8'))
  assert.deepEqual(report, { orders: r.orders.length, revenue: r.orders.reduce((s, o) => s + o.total, 0) }, 'out/report.json 的內容不對：要執行 tools/report.ts')
})

// [REPORT_MODE, Node 擋下時 stderr 的 permission, resource 的結尾, 說明]
const attacks: [string, string, string, string][] = [
  ['read-etc', 'FileSystemRead', '/etc/hosts', '讀 /etc/hosts：只能讀 data/，不能用 --allow-fs-read=*'],
  ['read-secret', 'FileSystemRead', 'secret.env', '讀同一個資料夾的 secret.env：只能讀 data/，不能用 --allow-fs-read=.'],
  ['spawn', 'ChildProcess', 'ls', '開子程序：不要加 --allow-child-process'],
  ['write-data', 'FileSystemWrite', 'data/hacked.txt', '寫 data/hacked.txt：只能寫 out/，不能用 --allow-fs-write=.'],
  ['write-sibling', 'FileSystemWrite', 'outbox.json', '寫 out/ 旁邊的 outbox.json：./out* 會包含所有 out 開頭的路徑，要寫 ./out/*'],
]
for (const [mode, permission, resource, why] of attacks) {
  test(`被入侵時做不到：${why.split('：')[0]}`, opts, async () => {
    const r = await runReport(mode)
    assert.ok(r.code !== 0 && r.stderr.includes('ERR_ACCESS_DENIED'),
      `REPORT_MODE=${mode} 的程式應該被 Permission Model 擋下（結束碼非 0、stderr 有 ERR_ACCESS_DENIED），這次結束碼 ${r.code}。${why}；也要加 --permission`)
    const m = /permission: '(\w+)',\s*resource: '([^']*)'/.exec(r.stderr)
    assert.ok(m && m[1] === permission && m[2].endsWith(resource),
      `REPORT_MODE=${mode} 要由 Node 的 Permission Model 擋下（permission: '${permission}'、resource 是 ${resource}）。每一種模式都要用同一行 node --permission … 執行 tools/report.ts`)
    assert.ok(!r.stdout.includes(r.secret), 'secret.env 的內容被讀出來了')
    assert.equal(existsSync(join(r.dir, 'data', 'hacked.txt')), false, 'data/hacked.txt 被寫進去了')
    assert.equal(existsSync(join(r.dir, 'outbox.json')), false, 'outbox.json 被寫進去了')
  })
}
