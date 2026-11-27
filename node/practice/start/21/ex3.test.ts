import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { runNode, startServer } from '../../helpers/proc.ts'

const opts = { timeout: 30_000 }
const file = join(import.meta.dirname, 'main.ts')

type Line = { msg: string, attempt?: number, ok?: boolean, t?: number }
const lines = (stdout: string): Line[] => stdout.split('\n').flatMap(l => {
  try { return [JSON.parse(l)] } catch { return [] }
})

// 每次重試之間的間隔，要接近 100、200、400、800ms（容許計時誤差）
function checkGaps(checks: Line[]) {
  const expected = [100, 200, 400, 800]
  for (let i = 1; i < checks.length; i++) {
    const gap = (checks[i].t ?? 0) - (checks[i - 1].t ?? 0)
    const want = expected[i - 1]
    // 下限擋「沒退避」「固定間隔」；上限放寬，因為電腦很忙時計時器會晚一點觸發
    assert.ok(gap >= want - 15 && gap < want * 1.5 + 300, `第 ${i} 次失敗後隔了 ${gap}ms 才重試，應該約 ${want}ms（指數退避：100、200、400、800）`)
  }
}

test('前 3 次連不上：退避重試，第 4 次成功後才開始聽', opts, async () => {
  const srv = await startServer(file, { env: { FAIL_TIMES: '3' }, timeoutMs: 15_000 })
  const all = lines(srv.out.stdout)
  const checks = all.filter(l => l.msg === 'checkDb')
  assert.deepEqual(checks.map(c => c.ok), [false, false, false, true], '前 3 次失敗、第 4 次成功：要在成功後停止重試')
  const firstOk = all.findIndex(l => l.msg === 'checkDb' && l.ok)
  const listening = all.findIndex(l => l.msg === 'listening')
  assert.ok(listening > firstOk, '要先確認資料庫可用才 listen：檢查成功前不能接受連線')
  checkGaps(checks)
  assert.equal(await (await fetch(srv.url)).text(), 'ok\n', '開始服務後要能回應')
  await srv.stop()
})

test('一直連不上：5 次後放棄，每次失敗都記在 stderr，以結束碼 1 結束', { timeout: 60_000 }, async () => {
  const tag = randomBytes(4).toString('hex')
  const r = await runNode(file, { env: { FAIL_TIMES: '99', PORT: '0', TAG: tag }, timeoutMs: 40_000 }).catch(err => {
    assert.fail(`程式一直沒有結束：重試要有次數上限（${(err as Error).message}）`)
  })
  const all = lines(r.stdout)
  assert.ok(!all.some(l => l.msg === 'listening'), '資料庫一直不可用時不能開始 listen')
  const checks = all.filter(l => l.msg === 'checkDb')
  assert.equal(checks.length, 5, `最多試 5 次，實際試了 ${checks.length} 次`)
  checkGaps(checks)
  assert.equal(r.code, 1, '全部失敗要以結束碼 1 結束，交給監督者處理')
  for (let i = 1; i <= 5; i++) {
    assert.ok(r.stderr.includes(`第 ${i} 次，${tag}`), `stderr 要記下每一次失敗的原因（err.message），找不到第 ${i} 次的`)
  }
  const exit = all.find(l => l.msg === 'exit')
  assert.ok(exit, '程序要自己結束（process.exit(1)）')
  const wait = (exit.t ?? 0) - (checks[4].t ?? 0)
  assert.ok(wait < 600, `第 5 次失敗後過了 ${wait}ms 才結束：最後一次失敗後不用再等`)
})
