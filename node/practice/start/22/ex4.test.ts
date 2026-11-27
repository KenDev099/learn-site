import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { run } from '../../helpers/proc.ts'
import { createTestDb } from '../../helpers/db.ts'

const opts = { timeout: 30_000 }
const here = import.meta.dirname
const correct = await readFile(join(here, 'orders.ts'), 'utf8')
// 一個全新、空的資料庫（public 裡沒有任何表）：只有用 createTestSchema() 的測試才跑得起來
const { url } = await createTestDb([])

function mutate(text: string, from: string, to: string) {
  assert.ok(text.includes(from), `orders.ts 被改過了，找不到「${from}」：刪掉 work/22/orders.ts 再跑一次 check.mjs 就會補回來`)
  return text.replace(from, to)
}
const mutants: [string, () => string, string][] = [
  ['超賣（沒檢查庫存夠不夠）', () => mutate(correct, 'WHERE id = $2 AND stock >= $1 RETURNING', 'WHERE id = $2 RETURNING'),
    '買的數量比庫存多時，要求丟 OutOfStockError，而且庫存沒有變'],
  ['沒有開交易（失敗時前面扣的庫存沒有還原）', () => mutate(correct, "await client.query('BEGIN')", ''),
    '第一項商品夠、第二項不夠，檢查第一項的庫存沒被扣'],
  ['失敗時沒有把連線還回池子', () => mutate(mutate(correct, "    await client.query('COMMIT')\n", "    await client.query('COMMIT')\n    client.release()\n"),
    'client.release(broken)', 'if (broken) client.release(broken)'),
    '下單失敗之後，檢查 pool.idleCount === pool.totalCount'],
]

// 在 work/22 裡建暫存資料夾（才找得到 pg 套件），放你的測試檔和一份 orders.ts
async function project(impl = correct) {
  const dir = await mkdtemp(join(here, '.mutant-'))
  after(() => rm(dir, { recursive: true, force: true }))
  for (const f of ['place-order.spec.ts', 'errors.ts', 'test-db.ts']) await writeFile(join(dir, f), await readFile(join(here, f)))
  await writeFile(join(dir, 'orders.ts'), impl)
  return dir
}
async function runSpec(dir: string) {
  const r = await run(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', 'place-order.spec.ts'],
    { cwd: dir, timeoutMs: 15_000, env: { DATABASE_URL: url } })
  const count = (k: string) => Number(r.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm'))?.[1] ?? 0)
  return { ...r, pass: count('pass'), fail: count('fail') }
}
const failures = (r: { stdout: string, stderr: string }) =>
  (r.stdout.split('\n').filter(l => /^not ok|^\s+(error|expected|actual):/.test(l)).slice(0, 12).join('\n') || r.stderr.slice(0, 600))
function mustPass(r: Awaited<ReturnType<typeof runSpec>>, when: string) {
  assert.equal(r.fail, 0, `${when}有測試沒過：\n${failures(r)}`)
  assert.equal(r.code, 0, `${when}node --test 沒有成功結束：\n${failures(r)}`)
}

test('配上正確的 orders.ts：至少 3 個測試，全部通過；同一個資料庫連跑兩次也通過', opts, async () => {
  const dir = await project()
  const first = await runSpec(dir)
  if (/relation "\w+" does not exist/.test(first.stdout + first.stderr)) {
    assert.fail('找不到表：要用 const { pool } = await createTestSchema() 拿到的 pool，不要自己連 public schema')
  }
  mustPass(first, '')
  assert.ok(first.pass >= 3, `至少要有 3 個測試（成功、庫存不夠、多項商品其中一項不夠），現在只有 ${first.pass} 個`)
  mustPass(await runSpec(dir), '第二次跑（資料庫裡留著第一次的資料）時')
})

test('兩份同時跑都通過（每份有自己的 schema）', opts, async () => {
  const [a, b] = await Promise.all([project(), project()])
  const [ra, rb] = await Promise.all([runSpec(a), runSpec(b)])
  mustPass(ra, '兩份同時跑時，第一份')
  mustPass(rb, '兩份同時跑時，第二份')
})

for (const [label, make, hint] of mutants) {
  test(`抓得到這個 bug：${label}`, opts, async () => {
    const r = await runSpec(await project(make()))
    assert.ok(r.fail > 0 || r.code !== 0, `把 orders.ts 改成「${label}」之後，你的測試還是全部通過。提示：${hint}`)
  })
}
