import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { listen } from '../../helpers/http.ts'
import * as errors from './errors.ts'

const opts = { timeout: 15_000 }
type Stock = { productId: number, stock: number }
type CheckAll = (baseUrl: string, ids: number[], o?: { concurrency?: number, signal?: AbortSignal }) => Promise<Stock[]>

async function load() {
  const mod: { checkAllStock?: unknown } = await import('./check-all.ts')
  assert.equal(typeof mod.checkAllStock, 'function', 'check-all.ts 要 export async function checkAllStock(baseUrl, ids, options)')
  return mod.checkAllStock as CheckAll
}

const salt = Math.floor(Math.random() * 100)
const stockOf = (id: number) => (id * 7 + salt) % 50

// 假上游：記錄同時進行中的請求數；delay(id) 決定每個請求多久回；failAt 是第幾個到達的請求要回 500
async function upstream({ delay, failAt }: { delay: (id: number) => number, failAt?: number }) {
  const st = { active: 0, max: 0, arrived: 0, aborted: 0, abortedAt: [] as number[], failedAt: 0 }
  const server = createServer((req, res) => {
    const id = Number(req.url!.split('/').pop())
    const n = ++st.arrived
    st.active++; st.max = Math.max(st.max, st.active)
    let done = false
    res.on('close', () => {
      st.active--
      if (!done) { st.aborted++; st.abortedAt.push(Date.now()) }
    })
    if (n === failAt) { done = true; st.failedAt = Date.now(); res.writeHead(500).end(); return }
    setTimeout(() => { done = true; res.end(JSON.stringify({ productId: id, stock: stockOf(id) })) }, delay(id))
  })
  const { url } = await listen(server)
  return { url, st }
}

async function settle<T>(p: Promise<T>, limitMs: number) {
  const t0 = Date.now()
  let timer: NodeJS.Timeout | undefined
  const guard = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`checkAllStock 過了 ${limitMs}ms 還沒有結果`)), limitMs) })
  try {
    return { ok: true as const, value: await Promise.race([p, guard]), ms: Date.now() - t0 }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('checkAllStock 過了')) throw error
    return { ok: false as const, error, ms: Date.now() - t0 }
  } finally { clearTimeout(timer) }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => 101 + i)

test('同時最多 5 個請求，而且真的用到 5 個；結果順序和 ids 一樣', opts, async () => {
  const checkAllStock = await load()
  const list = ids(20).sort(() => Math.random() - 0.5)
  const up = await upstream({ delay: id => 40 + (id % 4) * 30 })    // 每個請求花的時間不同，完成順序會亂
  const r = await settle(checkAllStock(up.url, list), 5000)
  assert.ok(r.ok, `全部成功時不該失敗：${r.ok ? '' : String(r.error)}`)
  assert.equal(up.st.max <= 5, true, `同時進行的請求最多 5 個（實際最多 ${up.st.max} 個）：Promise.all 一次全發出去會打爆上游`)
  assert.equal(up.st.max, 5, `要同時跑 5 個，不是一個一個來（實際最多 ${up.st.max} 個）`)
  assert.equal(up.st.arrived, 20, '每個 id 查一次')
  assert.deepEqual(r.value, list.map(id => ({ productId: id, stock: stockOf(id) })), '結果的順序要和 ids 一樣，不是完成的順序')
})

test('一個請求慢，不能卡住其他的：做完一件就拿下一件，不是一批一批等', opts, async () => {
  const checkAllStock = await load()
  const list = ids(20)
  const slow = list[Math.floor(Math.random() * 5)]
  // 慢的那個請求要等其他 19 個都到了才回（最多等 3 秒）；其他的馬上回
  let arrived = 0
  let releasedByOthers = false
  let release = () => {}
  const others = new Promise<void>(r => { release = r })
  const server = createServer(async (req, res) => {
    const id = Number(req.url!.split('/').pop())
    if (++arrived === list.length) release()
    if (id === slow) {
      const timer = setTimeout(release, 3000)
      await others
      clearTimeout(timer)
      releasedByOthers = arrived === list.length
    }
    res.end(JSON.stringify({ productId: id, stock: stockOf(id) }))
  })
  const { url } = await listen(server)
  const r = await settle(checkAllStock(url, list), 8000)
  assert.ok(releasedByOthers || arrived === list.length,
    `id ${slow} 很慢：另外 4 個 worker 應該在它回來之前就把其他 19 個品項查完（它卡著的時候上游只收到 ${arrived} 個請求）。用 worker 做完一件就拿下一件，不要用 Promise.all 一批一批等最慢的那個`)
  assert.ok(r.ok, `全部成功時不該失敗：${r.ok ? '' : String(r.error)}`)
})

test('concurrency 參數：concurrency: 3 時同時最多 3 個', opts, async () => {
  const checkAllStock = await load()
  const up = await upstream({ delay: () => 40 })
  const r = await settle(checkAllStock(up.url, ids(9), { concurrency: 3 }), 5000)
  assert.ok(r.ok, `全部成功時不該失敗：${r.ok ? '' : String(r.error)}`)
  assert.equal(up.st.max, 3, `concurrency: 3 要同時跑 3 個（實際最多 ${up.st.max} 個）`)
})

test('fail fast：第 7 個請求回 500，reject 那個錯誤，其他進行中的請求馬上取消、不再發新的', opts, async () => {
  const checkAllStock = await load()
  const up = await upstream({ delay: () => 400, failAt: 7 })
  // 前 5 個 400ms 才回，之後 5 個 worker 一起拿下一批；第 7 個立刻回 500，同一批的其他請求還在跑
  const r = await settle(checkAllStock(up.url, ids(30)), 5000)
  assert.ok(!r.ok, '有一個失敗就要 reject')
  assert.ok(r.error instanceof errors.UpstreamHttpError && r.error.status === 500,
    `要 reject 第一個失敗的錯誤（UpstreamHttpError 500），不是被取消的那些請求的 AbortError（收到 ${String(r.error)}）`)
  await new Promise(res => setTimeout(res, 150))
  assert.ok(up.st.aborted >= 1, '失敗之後，其他進行中的請求要用 AbortController 取消（上游看到連線被關閉）')
  assert.ok(up.st.abortedAt.every(t => t - up.st.failedAt < 100), '其他請求要在失敗後 100ms 內被取消')
  assert.equal(up.st.active, 0, '失敗之後不能還有請求在跑')
  const arrived = up.st.arrived
  await new Promise(res => setTimeout(res, 500))
  assert.equal(up.st.arrived, arrived, '失敗之後不能再發新的請求')
  assert.ok(arrived < 15, `30 個 id 只該發出前面一部分（實際發了 ${arrived} 個）`)
})

test('外部 signal 取消：全部停下，reject AbortError', opts, async () => {
  const checkAllStock = await load()
  const up = await upstream({ delay: () => 400 })
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 100)
  const r = await settle(checkAllStock(up.url, ids(12), { signal: ac.signal }), 5000)
  assert.ok(!r.ok, '外部 signal 取消要 reject')
  assert.ok(r.ms < 300, `100ms 時取消，要馬上停（花了 ${r.ms}ms）：把 signal 傳給每個 getStock`)
  assert.equal((r.error as Error).name, 'AbortError', '外部取消要 reject AbortError')
  await new Promise(res => setTimeout(res, 100))
  assert.equal(up.st.active, 0, '取消之後不能還有請求在跑')
  assert.equal(up.st.arrived, 5, '取消之後不能再發新的請求')
})
