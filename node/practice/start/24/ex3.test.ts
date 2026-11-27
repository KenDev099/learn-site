import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { runNode, startServer } from '../../helpers/proc.ts'

const opts = { timeout: 60_000 }
const file = join(import.meta.dirname, 'primary.ts')

// 每次都開一條新連線（agent: false）：cluster 分配的是「連線」，不是請求
function get(url: string) {
  return new Promise<{ status: number, body: string }>((resolve, reject) => {
    const req = request(url, { agent: false }, res => {
      let body = ''
      res.setEncoding('utf8').on('data', s => { body += s }).on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('10 秒沒有回應')))
    req.end()
  })
}

async function pids(url: string, n = 20) {
  const got = await Promise.all(Array.from({ length: n }, () => get(url + '/pid').then(r => JSON.parse(r.body).pid as number, () => 0)))
  return new Set(got.filter(Boolean))
}

// 在 ms 毫秒內等到 check(目前的 pid 集合) 成立
async function waitPids(url: string, check: (s: Set<number>) => boolean, ms: number) {
  let last = new Set<number>()
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) {
    last = await pids(url)
    if (check(last)) return last
  }
  return last
}

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH' }
}

test('依 WORKERS 啟動多個 worker，新連線輪流分給它們', opts, async () => {
  const n = 2 + Math.floor(Math.random() * 2)   // 2 或 3
  const srv = await startServer(file, { env: { WORKERS: String(n) }, timeoutMs: 20_000 })
  const seen = await waitPids(srv.url, s => s.size === n, 15_000)
  assert.equal(seen.size, n, `WORKERS=${n}，20 條新連線卻只看到 ${seen.size} 個不同的 pid：要依環境變數 WORKERS 呼叫 cluster.fork()`)
  await srv.stop('SIGKILL')
})

test('worker 崩潰後，幾秒內補一個新的', opts, async () => {
  const srv = await startServer(file, { env: { WORKERS: '2' }, timeoutMs: 20_000 })
  const before = await waitPids(srv.url, s => s.size === 2, 15_000)
  assert.equal(before.size, 2, '一開始要有 2 個 worker')
  const crashed = JSON.parse((await get(srv.url + '/crash')).body).pid as number
  for (const t = Date.now(); alive(crashed) && Date.now() - t < 10_000;) await sleep(10)
  assert.equal(alive(crashed), false, `GET /crash 之後 worker ${crashed} 應該要崩潰`)
  const t0 = Date.now()
  const after = await waitPids(srv.url, s => s.size === 2 && !s.has(crashed), 8_000)
  assert.ok(!after.has(crashed) && after.size === 2, `worker ${crashed} 崩潰 ${Date.now() - t0}ms 後，回應的 pid 只有 ${[...after].join('、')}：在 cluster 的 'exit' 事件裡（退避之後）呼叫 cluster.fork() 補一個`)
  await srv.stop('SIGKILL')
})

test('一啟動就崩潰：退避重啟，10 秒內崩潰超過 5 次就停止並以 1 結束', opts, async () => {
  let r
  try {
    r = await runNode(file, { env: { WORKERS: '1', CRASH_ON_START: '1', PORT: '0' }, timeoutMs: 40_000 })
  } catch {
    assert.fail('worker 一直崩潰，primary 卻 40 秒都沒結束：這是崩潰迴圈。要記下最近 10 秒的崩潰時間，超過 5 次就 process.exit(1)')
  }
  const times = r.stderr.split('\n').flatMap(l => { try { const j = JSON.parse(l); return j.msg === 'crash on start' ? [j.t as number] : [] } catch { return [] } })
  assert.ok(times.length >= 2, `worker 只啟動了 ${times.length} 次：崩潰後要重啟`)
  assert.equal(r.code, 1, `放棄重啟時要以結束碼 1 結束（實際 ${r.code}），讓上一層的監督者知道出事了`)
  assert.ok(times.length >= 6 && times.length <= 7, `worker 一共崩潰了 ${times.length} 次：規則是 10 秒內崩潰超過 5 次（第 6 次）就停止`)
  const span = times.at(-1)! - times[0]
  assert.ok(span >= 1_500, `第一次到最後一次崩潰只隔 ${span}ms：重啟前要退避，等 100ms × 2^(n−1)（100、200、400、800…）`)
  const gaps = times.slice(1).map((t, i) => t - times[i])
  assert.ok(gaps.at(-1)! >= 1_500 && gaps.at(-1)! >= 2 * gaps[0], `每次崩潰之間隔了 ${gaps.join('、')}ms：等待時間要一次比一次長（指數退避 100、200、400、800、1600ms），不是固定等一樣久`)
})

test('SIGTERM：進行中的請求做完、所有 worker 結束後，primary 以 0 結束', opts, async () => {
  const srv = await startServer(file, { env: { WORKERS: '2' }, timeoutMs: 20_000 })
  const workers = await waitPids(srv.url, s => s.size === 2, 15_000)
  assert.equal(workers.size, 2)
  const slow = get(srv.url + '/slow?ms=1500').then(r => r.status, () => 0)
  await sleep(300)
  srv.child.kill('SIGTERM')
  const timer = setTimeout(() => srv.child.kill('SIGKILL'), 20_000)
  const [code, signal] = await srv.exited
  clearTimeout(timer)
  assert.equal(await slow, 200, '收到 SIGTERM 時還在處理的請求要正常完成：primary 不能先結束（worker 會跟著立刻結束），也不能用 SIGKILL 砍 worker')
  assert.equal(signal, null, `primary 是被 ${signal} 結束的：收到 SIGTERM 要自己處理，而且要在所有 worker 結束後結束（不能一直補新的 worker）`)
  assert.equal(code, 0, '全部 worker 優雅關機後，primary 以結束碼 0 結束')
  await sleep(100)
  for (const pid of workers) assert.equal(alive(pid), false, `primary 結束了，worker ${pid} 還活著：變成孤兒程序`)
})
