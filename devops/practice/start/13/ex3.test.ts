// 練習 3：在持續的負載下縮減、再擴回副本，一個請求都不掉
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { docker, inspect } from '../../helpers/docker.ts'
import { API, http, inside, nginxT, reset, runAsync, sleep, up, type Reply } from './cluster.ts'

const FILES = ['ex3.compose.yaml']

before(() => { reset(); up(FILES) })
after(reset)

test('app 的 keepAliveTimeout 比 nginx upstream 的 keepalive_timeout 長', async () => {
  const block = /upstream\s+api\s*\{([^}]*)\}/.exec(nginxT())?.[1] ?? ''
  const m = /keepalive_timeout\s+(\d+)(ms|s|m)?\s*;/.exec(block)
  const nginxMs = m ? Number(m[1]) * ({ ms: 1, s: 1000, m: 60_000 } as Record<string, number>)[m[2] ?? 's'] : 60_000
  const r = await http('GET', '/config')
  assert.equal(r.status, 200, `GET /config 回 ${r.status}`)
  assert.ok(r.body.keepAliveTimeout > nginxMs,
    `app 的 keepAliveTimeout 是 ${r.body.keepAliveTimeout} ms，nginx upstream 的 keepalive_timeout 是 ${nginxMs} ms${m ? '' : '（沒寫，用預設 60 秒）'}：app 比較短時，nginx 可能把請求送進 app 正在關的閒置連線而回 502。在 setup() 設定 server.keepAliveTimeout，從 KEEPALIVE_TIMEOUT_MS 讀，預設 65 秒`)
  assert.equal(r.body.keepAliveTimeout, 75_000, `測試把 KEEPALIVE_TIMEOUT_MS 設成 75000，app 的 keepAliveTimeout 卻是 ${r.body.keepAliveTimeout}：要從環境變數 KEEPALIVE_TIMEOUT_MS 讀，沒設時才用 65 秒`)
})

// 下面幾個測試共用同一段情境：每 50 ms 送一個 POST /orders（每個在 app 裡花 1 秒，隨時都有十幾個在處理中），
// 跑 1.5 秒後 docker stop 第 3 個副本，排空期間從容器裡面打它，停好之後再擴回 3 個
type Scenario = { replies: Reply[], live: any, ready: any, other: any, stopMs: number, stopErr: string, state: any, upErr: string }
let scenario: Promise<Scenario> | undefined
function runScenario(): Promise<Scenario> {
  return scenario ??= (async () => {
    const tag = randomUUID().slice(0, 8)
    const replies: Reply[] = [], pending: Promise<void>[] = []
    let loading = true
    const load = (async () => {
      for (let i = 0; loading; i++) {
        pending.push(http('POST', '/orders', { productId: 3, note: `ex3-${tag}-${i}`, slowMs: 1_000 }).then(r => { replies.push(r) }))
        await sleep(50)
      }
    })()
    await sleep(1_500)
    const t0 = Date.now()
    const stopping = runAsync('docker', ['stop', '-t', '10', API(3)])
    await sleep(800)
    const [live, ready, other] = await Promise.all([
      inside(API(3), '/health/live'), inside(API(3), '/health/ready'), inside(API(3), '/products')])
    const stop = await stopping
    const stopMs = Date.now() - t0
    const state = inspect(API(3))?.State
    await sleep(1_000)
    const upR = await runAsync('docker', ['compose', '-p', 'ld-13', '-f', 'compose.yaml', '-f', FILES[0], 'up', '-d', '--wait', '--wait-timeout', '60'])
    await sleep(1_500)
    loading = false
    await load
    await Promise.all(pending)
    return { replies, live, ready, other, stopMs, stopErr: stop.code === 0 ? '' : stop.stderr, state, upErr: upR.code === 0 ? '' : upR.stderr }
  })()
}

test('縮減到 2 個、再擴回 3 個的整段期間，POST /orders 最多失敗 1 個', async () => {
  const s = await runScenario()
  assert.equal(s.upErr, '', `擴回 3 個副本失敗：${s.upErr}`)
  assert.ok(s.replies.length >= 50, `只送出了 ${s.replies.length} 個請求`)
  const bad = s.replies.filter(r => r.status < 200 || r.status > 299)
  const errors = docker('logs', 'ld-13-nginx-1').stderr.split('\n').filter(l => / \[error\] /.test(l)).slice(-3).map(l => l.replace(/^.*?\[error\] \S+ \*\d+ /, '').replace(/, client:.*$/, ''))
  // 容許 1 個：server.close() 關閒置連線的瞬間，nginx 可能剛好把請求寫進那條連線（connection reset by peer）。
  // 這個競爭只能靠代理先把副本移出名單來消除（Kubernetes 的 readiness 與 preStop），nginx 開放原始碼版做不到
  assert.ok(bad.length <= 1,
    `${s.replies.length} 個請求裡有 ${bad.length} 個失敗（${[...new Set(bad.map(r => r.status))].join('、')}）：收到 SIGTERM 不能馬上結束，要先排空 DRAIN_MS，再用 server.close() 等手上的請求做完。nginx 的錯誤：\n${errors.join('\n')}`)
})

test('被停止的副本在 10 秒內自己結束，ExitCode 0', async () => {
  const s = await runScenario()
  assert.equal(s.stopErr, '', `docker stop 失敗：${s.stopErr}`)
  assert.equal(s.state?.ExitCode, 0,
    `ExitCode 是 ${s.state?.ExitCode}${s.state?.ExitCode === 137 ? '（137 = 被 SIGKILL：10 秒內沒有自己結束。server.close() 之後要關掉 pg 與 Redis，再 process.exit(0)）' : ''}`)
  assert.ok(s.stopMs < 10_000, `花了 ${s.stopMs} ms 才停下來，要在 10 秒內`)
})

test('排空期間：/health/live 200、/health/ready 503、回應帶 Connection: close', async () => {
  const s = await runScenario()
  assert.equal(s.live.status, 200, `排空期間 /health/live 回 ${s.live.status}（${s.live.connection}）：程序還活著，回 503 會讓編排器以為它壞了而重啟${s.live.status === 0 ? '；0 表示連不上，程序已經結束或不再接新連線，要先排空 DRAIN_MS' : ''}`)
  assert.equal(s.ready.status, 503, `排空期間 /health/ready 回 ${s.ready.status}：收到 SIGTERM 就要回 503，讓前面的代理不再送新流量過來`)
  assert.equal(s.other.status, 200, `排空期間 GET /products 回 ${s.other.status}：排空時還是要正常服務`)
  assert.equal(s.other.connection.toLowerCase(), 'close', `排空期間的回應 Connection 標頭是「${s.other.connection}」：要是 close，代理用完這條連線就關掉，不會再重用它`)
})
