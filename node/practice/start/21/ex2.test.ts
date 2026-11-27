import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { Agent, request } from 'node:http'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startServer } from '../../helpers/proc.ts'

// 電腦很忙時子程序會變慢，所以時間的門檻都留了餘裕；錯誤寫法跟正確寫法的差距都是好幾秒
const opts = { timeout: 40_000 }
const file = join(import.meta.dirname, 'server.ts')
// 先載入 exit-mark.ts：程序觸發 'exit' 事件時印 {"msg":"exit","code":N,"at":時間}
const env = { NODE_OPTIONS: `--import=${pathToFileURL(join(import.meta.dirname, 'exit-mark.ts')).href}` }
type Srv = Awaited<ReturnType<typeof startServer>>

const parse = (stdout: string) => stdout.split('\n').flatMap(line => {
  try { return [JSON.parse(line) as { msg: string, code?: number, at?: number }] } catch { return [] }
})
const msgs = (stdout: string) => parse(stdout).map(l => l.msg)
const exitLine = (srv: Srv) => parse(srv.out.stdout).find(l => l.msg === 'exit')

// 已經送出訊號：等程序結束（'exit' 事件或被訊號砍掉），ms 毫秒還沒結束就砍掉
// 用 'exit' 事件的時間判斷：程序結束後作業系統回收它可能還要一段時間，那段不算學習者的
async function waitExit(srv: Srv, ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const mark = exitLine(srv)
    if (mark) return { code: mark.code ?? null, signal: null, at: mark.at ?? Date.now() }
    if (srv.child.signalCode) return { code: null, signal: srv.child.signalCode, at: Date.now() }
    await sleep(20)
  }
  srv.child.kill('SIGKILL')
  return { code: null, signal: 'SIGKILL' as NodeJS.Signals, at: Date.now() }
}

// 用會一直留著 keep-alive 連線的客戶端送 GET（http.Agent keepAlive，不會自己關閒置連線）
const agent = new Agent({ keepAlive: true })
after(() => agent.destroy())
function get(url: string): Promise<{ status: number, at: number }> {
  return new Promise(resolve => {
    request(url, { agent }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode ?? 0, at: Date.now() }))
    }).on('error', () => resolve({ status: 0, at: Date.now() })).end()
  })
}

// 直接開一條 TCP 連線，回傳成功或錯誤代碼（例如 ECONNREFUSED）
async function tryConnect(port: number) {
  const socket = connect(port, '127.0.0.1')
  try {
    await once(socket, 'connect')
    return 'connected'
  } catch (err) {
    return (err as NodeJS.ErrnoException).code
  } finally {
    socket.destroy()
  }
}

test('SIGTERM：進行中的請求完成、不接新連線、依序關閉、以 0 結束', opts, async () => {
  const srv = await startServer(file, { env, timeoutMs: 15_000 })
  // 先送一個請求：做完後連線留著（keep-alive），慢請求會重用這條連線
  assert.equal((await get(srv.url + '/')).status, 200, 'GET / 要回 200')
  // 慢請求：1.5 秒
  let done = false
  const slow = get(srv.url + '/slow?ms=1500').then(r => { done = true; return r })
  await sleep(300)
  srv.child.kill('SIGTERM')
  // 慢請求還沒做完之前，新的連線就要被拒絕
  let refused = false
  while (!done && !refused) {
    refused = await tryConnect(srv.port) === 'ECONNREFUSED'
    if (!refused) await sleep(50)
  }
  const s = await slow
  assert.equal(s.status, 200, '收到 SIGTERM 時還在處理的請求要正常完成：不能立刻結束程序，也不能先關 pool')
  assert.ok(refused, '收到 SIGTERM 之後、慢請求還沒做完時，新連線就要被拒絕（ECONNREFUSED）：要呼叫 server.close()')
  const r = await waitExit(srv, 15_000)
  const late = r.at - s.at
  assert.equal(r.signal, null, `程序是被 ${r.signal} 結束的，不是自己結束：收到 SIGTERM 要自己收尾，並在時限內結束`)
  assert.ok(late < 2_500, `慢請求完成後 ${late}ms 程序才結束：server.close() 不會關掉之後才閒置的 keep-alive 連線（要等約 6 秒），關機中的回應要帶 Connection: close，或在請求完成後 closeIdleConnections()；時限的計時器也不能撐住程序`)
  assert.equal(r.code, 0, '優雅關機完成要以結束碼 0 結束')
  const order = msgs(srv.out.stdout).filter(m => ['server closed', 'pool closed', 'bye'].includes(m))
  assert.deepEqual(order, ['server closed', 'pool closed', 'bye'], `stdout 的順序要是 server closed → pool closed → bye，實際：${JSON.stringify(order)}`)
})

test('SIGINT（Ctrl+C）也一樣優雅關機', opts, async () => {
  const srv = await startServer(file, { env, timeoutMs: 15_000 })
  assert.equal((await get(srv.url + '/')).status, 200)
  const t0 = Date.now()
  srv.child.kill('SIGINT')
  const r = await waitExit(srv, 15_000)
  assert.equal(r.signal, null, `程序是被 ${r.signal} 結束的：SIGINT 也要處理`)
  assert.equal(r.code, 0, 'SIGINT 的優雅關機也要以 0 結束')
  assert.ok(r.at - t0 < 3_000, '沒有進行中的請求時，關機應該馬上完成（閒置的連線 server.close() 會直接關掉）')
  assert.ok(msgs(srv.out.stdout).includes('bye'), '最後要印 {"msg":"bye"}')
})

test('超過 SHUTDOWN_TIMEOUT_MS：強制關閉並以 1 結束', opts, async () => {
  const srv = await startServer(file, { env: { ...env, SHUTDOWN_TIMEOUT_MS: '500' }, timeoutMs: 15_000 })
  void get(srv.url + '/slow?ms=10000')   // 卡住 10 秒的請求
  await sleep(300)
  const t0 = Date.now()
  srv.child.kill('SIGTERM')
  const r = await waitExit(srv, 7_000)
  const ms = r.at - t0
  assert.equal(r.signal, null, '卡住的請求讓程序一直不結束（最後被測試砍掉）：要有關機時限，到了就 closeAllConnections() 並結束；要讀環境變數 SHUTDOWN_TIMEOUT_MS')
  assert.equal(r.code, 1, '時限到了強制結束，結束碼是 1（不是正常結束）')
  assert.ok(ms >= 400 && ms < 5_000, `SHUTDOWN_TIMEOUT_MS=500 時應該約 0.5 秒後結束，實際 ${ms}ms：要讀環境變數 SHUTDOWN_TIMEOUT_MS`)
})

test('關機途中又收到 SIGINT：立即以 1 結束', opts, async () => {
  const srv = await startServer(file, { env, timeoutMs: 15_000 })
  void get(srv.url + '/slow?ms=8000')
  await sleep(300)
  srv.child.kill('SIGINT')
  await sleep(300)
  assert.ok(!exitLine(srv) && !srv.child.signalCode, '第一次 SIGINT 要等進行中的請求，不能馬上結束')
  const t0 = Date.now()
  srv.child.kill('SIGINT')
  const r = await waitExit(srv, 10_000)
  const ms = r.at - t0
  assert.equal(r.signal, null, `程序是被 ${r.signal} 結束的：第二次訊號要自己以 1 結束`)
  assert.equal(r.code, 1, '第二次訊號是使用者不想等了，以結束碼 1 結束')
  assert.ok(ms < 3_000, `第二次 SIGINT 之後 ${ms}ms 才結束：要立即結束，不能繼續等進行中的請求`)
})
