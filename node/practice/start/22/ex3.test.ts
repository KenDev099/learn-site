import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { run } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 45_000 }
const multi = { timeout: 300_000 }   // 要連跑好幾次 node --test 的項目
const correct = await readFile(join(import.meta.dirname, 'pickup.ts'), 'utf8')

// 判分時先執行這個檔：
// 1. 現在時間固定在台北 2026-01-02 01:30（UTC 還是 1 月 1 日），依賴「今天」的斷言會露餡
// 2. 測試裡 listen 固定的 port 直接丟錯：固定 port 在兩份同時跑、或別的程式佔用時就會失敗
// 3. 測試檔或 pickup.ts 用真的計時器等 1 秒以上（setTimeout、timers/promises）直接丟錯：
//    模組頂層、before 裡的等待也算；開了 t.mock.timers 時用的是假的計時器，不受影響
const PRELOAD = `import net from 'node:net'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { promisify } from 'node:util'
const tooLong = (ms) => {
  if (!(Number(ms) >= 1000)) return
  const caller = new Error().stack.split('\\n')[3] ?? ''
  if (/flaky\\.spec\\.ts|pickup\\.ts/.test(caller)) {
    throw new Error('測試真的等了 ' + ms + 'ms：用 t.mock.timers 讓時間前進，不要真的等（模組頂層、before 裡也一樣）')
  }
}
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = function (fn, ms, ...args) { tooLong(ms); return realSetTimeout.call(this, fn, ms, ...args) }
globalThis.setTimeout[promisify.custom] = realSetTimeout[promisify.custom]
const timersPromises = createRequire(import.meta.url)('node:timers/promises')
const realSleep = timersPromises.setTimeout
timersPromises.setTimeout = function (ms, ...args) { tooLong(ms); return realSleep.call(this, ms, ...args) }
syncBuiltinESMExports()
const NOW = Date.UTC(2026, 0, 1, 17, 30)
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...args) { if (args.length === 0) super(NOW); else super(...args) }
  static now() { return NOW }
}
const listen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  const port = typeof args[0] === 'object' && args[0] !== null ? args[0].port : args[0]
  if ((typeof port === 'number' || /^\\d+$/.test(String(port))) && Number(port) !== 0) {
    throw new Error('測試裡 listen 了固定的 port ' + port + '：改成 listen(0)，再用 server.address().port 拿到系統分配的 port')
  }
  return listen.apply(this, args)
}
`

function mutate(from: string, to: string) {
  assert.ok(correct.includes(from), `pickup.ts 被改過了，找不到「${from}」：刪掉 work/22/pickup.ts 再跑一次 check.mjs 就會補回來`)
  return correct.replace(from, to)
}
const mutants: [string, () => string, string][] = [
  ['訂單編號從 0 開始', () => mutate('id: orders.length + 1', 'id: orders.length'), '用全新的 store 加一張訂單，檢查編號是 1'],
  ['沖煮完沒有變成 ready', () => mutate("order.status = 'ready'", "order.status = 'brewing'"), '用假時鐘走 BREW_MS，檢查 status 變成 ready'],
  ['收據的月份少 1', () => mutate('now.getMonth() + 1', 'now.getMonth()'), '傳一個固定的 Date 給 receiptTitle，比對寫死的預期字串'],
  ['收據用 UTC 的日期（台灣凌晨會差一天）', () => mutate('now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}', 'now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}'),
    '傳一個台灣凌晨的時間（例如 new Date(2026, 0, 2, 1, 30)）給 receiptTitle'],
  ['查不到的訂單也回 200', () => mutate('res.statusCode = order ? 200 : 404', 'res.statusCode = 200'), '保留「查不到回 404」的斷言'],
]

async function project(impl = correct) {
  const spec = await readFile(join(import.meta.dirname, 'flaky.spec.ts'), 'utf8')
  return tmpProject({ 'flaky.spec.ts': spec, 'pickup.ts': impl, 'preload.mjs': PRELOAD })
}
async function runSpec(dir: string, args: string[] = []) {
  const preload = pathToFileURL(join(dir, 'preload.mjs')).href
  const r = await run(process.execPath, ['--test', '--test-reporter=tap', ...args, 'flaky.spec.ts'],
    { cwd: dir, timeoutMs: 30_000, env: { NODE_OPTIONS: `--import=${preload}`, TZ: 'Asia/Taipei' } })
  const count = (k: string) => Number(r.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm'))?.[1] ?? 0)
  return { ...r, pass: count('pass'), fail: count('fail'), ms: testMs(r.stdout) }
}
// 每個測試自己花的時間加總（TAP 裡頂層測試的 duration_ms），不含啟動 node 的時間，機器忙的時候也準
const testMs = (stdout: string) => [...stdout.matchAll(/^  duration_ms: ([\d.]+)$/gm)].reduce((s, m) => s + Number(m[1]), 0)
const failures = (stdout: string) => stdout.split('\n').filter(l => /^not ok|^\s+(error|expected|actual):/.test(l)).slice(0, 12).join('\n')
function mustPass(r: Awaited<ReturnType<typeof runSpec>>, when: string) {
  assert.equal(r.fail, 0, `${when}有測試沒過：\n${failures(r.stdout)}`)
  assert.equal(r.code, 0, `${when}node --test 沒有成功結束：\n${r.stderr.slice(0, 600)}`)
}

test('正常跑：至少 4 個測試，全部通過，不用固定 port、不依賴今天的日期，2 秒內跑完', opts, async () => {
  const r = await runSpec(await project())
  mustPass(r, '')
  assert.ok(r.pass >= 4, `至少要保留 4 個測試（編號、沖煮、收據、404），現在只有 ${r.pass} 個`)
  assert.ok(r.ms < 2000, `測試一共花了 ${Math.round(r.ms)}ms：不要真的等 2 秒，用 t.mock.timers`)
})

test('打亂順序跑 5 次（--test-random-seed=1…5）都通過', multi, async () => {
  const dir = await project()
  for (const seed of [1, 2, 3, 4, 5]) mustPass(await runSpec(dir, [`--test-random-seed=${seed}`]), `--test-random-seed=${seed} 時`)
})

test('每個測試單獨跑也通過（不依賴前一個測試留下的狀態）', multi, async () => {
  const dir = await project()
  const names = [...(await runSpec(dir)).stdout.matchAll(/^ok \d+ - (.+)$/gm)].map(m => m[1])
  assert.ok(names.length > 0, '找不到任何通過的測試')
  for (const name of names) {
    const escaped = name.replace(/\\#/g, '#').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const r = await runSpec(dir, [`--test-name-pattern=^${escaped}$`])
    mustPass(r, `只跑「${name}」時`)
    assert.equal(r.pass, 1, `只跑「${name}」時應該剛好跑 1 個測試`)
  }
})

test('兩份同時跑都通過', multi, async () => {
  const [a, b] = await Promise.all([project(), project()])
  const [ra, rb] = await Promise.all([runSpec(a), runSpec(b)])
  mustPass(ra, '兩份同時跑時，第一份')
  mustPass(rb, '兩份同時跑時，第二份')
})

for (const [label, make, hint] of mutants) {
  test(`修好之後還抓得到這個 bug：${label}`, opts, async () => {
    const r = await runSpec(await project(make()))
    assert.ok(r.fail > 0 || r.code !== 0, `把 pickup.ts 改成「${label}」之後，你的測試還是全部通過。提示：${hint}`)
  })
}
