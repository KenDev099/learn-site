import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeClock } from '../../helpers/clock.ts'
import { TenantLimiter, TooManyRequests } from './ex3.ts'

// 讓已經可以執行的 Promise 都跑完
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)) }
// 20ms 內還沒結束就當成「還在等」
const outcome = (p: Promise<unknown>) => Promise.race([
  p.then(v => ({ state: 'resolved', value: v }), e => ({ state: 'rejected', error: e })),
  new Promise(r => setTimeout(() => r({ state: 'pending' }), 20)),
]) as Promise<{ state: string; value?: unknown; error?: unknown }>

// 一個由測試決定什麼時候結束的工作
function job(log: string[], name: string) {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  return { fn: () => { log.push(name); return promise }, finish: () => resolve(name), fail: () => reject(new Error(`${name} 失敗`)) }
}

async function expectRejected(limiter: TenantLimiter, tenant: string, retryAfterMs: number, why: string) {
  let called = false
  const r = await outcome(limiter.run(tenant, async () => { called = true; return 'x' }))
  assert.notEqual(r.state, 'pending', `${why}：超過每分鐘上限要「立刻」丟出 TooManyRequests，不要排隊等`)
  assert.equal(r.state, 'rejected', `${why}：超過每分鐘上限要丟出 TooManyRequests，你的程式卻讓它執行了`)
  assert.ok(r.error instanceof TooManyRequests, `${why}：丟出的要是 TooManyRequests`)
  assert.equal((r.error as TooManyRequests).retryAfterMs, retryAfterMs, `${why}：retryAfterMs 要是補到 1 個 token 還要等的毫秒數`)
  assert.equal(called, false, `${why}：被拒絕的請求不能呼叫 fn`)
}

async function runQuick(limiter: TenantLimiter, tenant: string, n: number, why: string) {
  for (let i = 0; i < n; i++) {
    const r = await outcome(limiter.run(tenant, async () => i))
    assert.equal(r.state, 'resolved', `${why}：第 ${i + 1} 個請求應該要成功（${r.state === 'rejected' ? (r.error as Error).message : '還在等'}）`)
    assert.equal(r.value, i, 'run 要回傳 fn 的結果')
  }
}

test('並發上限 3：同一個租戶的第 4 個要等前面的做完才開始，先來先做', async () => {
  const clock = fakeClock()
  const limiter = new TenantLimiter({ maxConcurrent: 3, ratePerMin: 100, now: clock.now })
  const log: string[] = []
  const jobs = ['a1', 'a2', 'a3', 'a4', 'a5'].map(n => job(log, n))
  const results = jobs.map(j => limiter.run('信義店', j.fn))
  await settle()
  assert.deepEqual(log, ['a1', 'a2', 'a3'], '同一個租戶同時最多 3 個 fn 在執行，第 4、5 個要排隊')
  jobs[1].finish()
  await settle()
  assert.deepEqual(log, ['a1', 'a2', 'a3', 'a4'], 'a2 做完後，排在最前面的 a4 才開始')
  for (const j of jobs) j.finish()
  assert.deepEqual(await Promise.all(results), ['a1', 'a2', 'a3', 'a4', 'a5'], '每個 run 都回傳自己 fn 的結果')
})

test('不同租戶互不影響：信義店額滿時，大安店照樣馬上執行', async () => {
  const clock = fakeClock()
  const limiter = new TenantLimiter({ maxConcurrent: 2, ratePerMin: 5, now: clock.now })
  const log: string[] = []
  const busy = ['x1', 'x2', 'x3'].map(n => job(log, n))
  const pending = busy.map(j => limiter.run('信義店', j.fn))
  await settle()
  const other = job(log, 'b1')
  const r = limiter.run('大安店', other.fn)
  await settle()
  assert.ok(log.includes('b1'), '大安店的請求被信義店的並發卡住了：每個租戶要有自己的名額（用 Map 以 tenant 分開）')
  other.finish()
  assert.equal(await r, 'b1')
  for (const j of busy) j.finish()
  await Promise.all(pending)
  // 信義店已經用掉 3 個 token，大安店的桶是自己的
  await runQuick(limiter, '大安店', 4, '大安店的桶跟信義店分開')
})

test('每分鐘 10 個：第 11 個立刻被拒；過 6 秒補 1 個，不會一次補滿', async () => {
  const clock = fakeClock(1_000_000)
  const limiter = new TenantLimiter({ maxConcurrent: 50, ratePerMin: 10, now: clock.now })
  await runQuick(limiter, '信義店', 10, '桶一開始是滿的（10 個）')
  await expectRejected(limiter, '信義店', 6000, '同一分鐘的第 11 個')
  clock.advance(3000)
  await expectRejected(limiter, '信義店', 3000, '過 3 秒只補了半個')
  clock.advance(3000)
  await runQuick(limiter, '信義店', 1, '過 6 秒補 1 個（依經過的時間補，不是等滿一分鐘才重置）')
  await expectRejected(limiter, '信義店', 6000, '過 6 秒只補 1 個，不是一次補滿')
  clock.advance(600_000)
  await runQuick(limiter, '信義店', 10, '過了很久，桶又滿了')
  await expectRejected(limiter, '信義店', 6000, '桶最多只有 10 個：閒置再久也不能存超過 ratePerMin')
})

test('fn 丟錯：錯誤原樣丟出，名額要還回來', async () => {
  const clock = fakeClock()
  const limiter = new TenantLimiter({ maxConcurrent: 1, ratePerMin: 100, now: clock.now })
  const log: string[] = []
  const first = job(log, 'f1')
  const second = job(log, 'f2')
  const p1 = limiter.run('信義店', first.fn)
  const p2 = limiter.run('信義店', second.fn)
  await settle()
  assert.deepEqual(log, ['f1'], 'maxConcurrent 1：第 2 個要等')
  first.fail()
  await assert.rejects(p1, /f1 失敗/, 'fn 丟的錯誤要原樣丟出')
  await settle()
  assert.deepEqual(log, ['f1', 'f2'], 'fn 丟錯之後名額沒有還回來，後面的請求永遠卡住：用 try/finally 釋放名額')
  second.finish()
  assert.equal(await p2, 'f2')
  await runQuick(limiter, '信義店', 3, '之後的請求照常執行')
})

test('排隊中的請求已經扣過 token：速率用完時，下一個立刻被拒，不會先排進並發佇列', async () => {
  const clock = fakeClock()
  const limiter = new TenantLimiter({ maxConcurrent: 1, ratePerMin: 2, now: clock.now })
  const log: string[] = []
  const first = job(log, 'q1')
  const second = job(log, 'q2')
  const p1 = limiter.run('信義店', first.fn)
  const p2 = limiter.run('信義店', second.fn)   // 排隊中，但呼叫 run 時就扣了 token
  await settle()
  await expectRejected(limiter, '信義店', 30_000, '2 個 token 都被執行中與排隊中的請求用掉了')
  first.finish()
  second.finish()
  assert.deepEqual(await Promise.all([p1, p2]), ['q1', 'q2'])
})
