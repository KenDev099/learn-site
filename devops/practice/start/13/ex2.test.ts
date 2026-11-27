// 練習 2：nginx 把流量分給 3 個副本，副本掛掉、換 IP 都不出錯，POST 不會被重送
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { docker, inspect } from '../../helpers/docker.ts'
import { API, HOGS, compose, http, nginxT, psql, reset, sleep, up } from './cluster.ts'

const ips = () => [1, 2, 3].map(n => inspect(API(n))?.NetworkSettings?.Networks?.['ld-13_default']?.IPAddress ?? '')
const upstreamBlock = () => /upstream\s+api\s*\{([^}]*)\}/.exec(nginxT())?.[1] ?? ''

before(() => { reset(); up() })
after(reset)

test('upstream 有被動健康檢查：max_fails=2 fail_timeout=5s；proxy_next_upstream 遇到 error、timeout、502、503 換下一台；proxy_connect_timeout 不超過 2 秒', () => {
  const block = upstreamBlock()
  assert.ok(block, '在 nginx -T 裡找不到 upstream api { … }：upstream 的名稱要叫 api，proxy_pass http://api 才會用到它')
  assert.match(block, /\bmax_fails=2\b/, 'server 那一行要加 max_fails=2：2 次失敗才判定這台壞掉')
  assert.match(block, /\bfail_timeout=5s?\b/, 'server 那一行要加 fail_timeout=5s：判定壞掉後 5 秒內不再送過去')
  const next = /proxy_next_upstream\s+([^;]*);/.exec(nginxT())?.[1].split(/\s+/) ?? []
  for (const k of ['error', 'timeout', 'http_502', 'http_503'])
    assert.ok(next.includes(k), `proxy_next_upstream 要包含 ${k}，目前是「${next.join(' ') || '沒寫（預設 error timeout）'}」`)
  const ct = /proxy_connect_timeout\s+(\d+)(ms|s)?\s*;/.exec(nginxT())
  const ctMs = ct ? Number(ct[1]) * (ct[2] === 'ms' ? 1 : 1000) : 60_000
  assert.ok(ctMs <= 2000, `proxy_connect_timeout 是 ${ct ? ct[0] : '沒寫（預設 60 秒）'}：副本當掉時，送到它的請求會等這麼久才換下一台。內部網路設成 2s 以內`)
})

test('least_conn：有一個副本正在處理慢請求時，新的請求分給其他副本', async () => {
  const slow = http('POST', '/orders', { productId: 1, note: `ex2-slow-${randomUUID()}`, slowMs: 2500 })
  await sleep(400)
  const fast: string[] = []
  for (let i = 0; i < 6; i++) fast.push((await http('GET', '/products')).headers['x-instance'])
  const busy = (await slow).headers['x-instance']
  assert.ok(busy, '慢請求沒有成功回應：先確認 POST /orders 會回 201')
  assert.ok(!fast.includes(busy), `慢請求在 ${busy} 上處理的期間，還是有請求被送到它（${fast.join('、')}）：upstream 要用 least_conn，把請求給目前連線最少的副本`)
})

test('60 個 GET 分到全部 3 個副本', async () => {
  const seen = new Set<string>()
  for (let i = 0; i < 60; i++) {
    const r = await http('GET', '/products')
    assert.equal(r.status, 200, `GET /products 回 ${r.status}：${JSON.stringify(r.body)}`)
    seen.add(r.headers['x-instance'])
  }
  assert.equal(seen.size, 3, `60 個請求只分到 ${seen.size} 個副本`)
})

test('docker kill 一個副本之後，30 個 GET 最多失敗 1 個', async () => {
  assert.equal(docker('kill', API(1)).code, 0, `docker kill ${API(1)} 失敗`)
  const bad: string[] = []
  for (let i = 0; i < 30; i++) {
    const r = await http('GET', '/products')
    if (r.status !== 200) bad.push(`第 ${i + 1} 個：${r.status}`)
  }
  // resolve 剛好在重試途中更新名單時，nginx 可能回一次 502（no live upstreams），所以容許 1 個
  assert.ok(bad.length <= 1, `副本掛掉後有 ${bad.length} 個請求失敗（${bad.join('、')}）：連不上時要換下一台（proxy_next_upstream error timeout），而且建立連線的逾時不能是預設的 60 秒：proxy_connect_timeout 設成 2s`)
})

test('api 容器全部重建（IP 都換了）之後，10 秒內恢復全部 200', async () => {
  const before = ips()
  // 先移除所有 api 容器，用 3 個佔位容器拿走舊的 IP，新的 api 容器就一定拿到新 IP
  const rm = compose([], 'rm', '-s', '-f', 'api')
  assert.equal(rm.code, 0, `移除 api 失敗：${rm.stderr}`)
  for (const hog of HOGS) docker('run', '-d', '--name', hog, '--network', 'ld-13_default', 'nginx:1.30.6-alpine', 'sleep', '300')
  try {
    const r = compose([], 'up', '-d', '--no-deps', '--wait', 'api')
    assert.equal(r.code, 0, `重建 api 失敗：${r.stderr.split('\n').slice(-5).join('\n')}`)
    const now = ips()
    assert.ok(now.every(ip => ip && !before.includes(ip)), `重建後 IP 沒有全部改變（前：${before}，後：${now}），測不出效果`)
    const t0 = Date.now()
    let last = 0
    while (Date.now() - t0 < 10_000) {
      last = (await http('GET', '/products')).status
      if (last === 200) break
      await sleep(300)
    }
    assert.equal(last, 200, `重建後 10 秒還是 ${last}：nginx 只在啟動時查一次 api 的 IP，一直連舊的位址。server 加上 resolve，並設定 resolver 127.0.0.11 valid=5s 與 zone`)
    await sleep(6_000)   // resolver valid=5s：再過一輪解析，3 個新副本都要被用到
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const g = await http('GET', '/products')
      assert.equal(g.status, 200, `恢復後又出現 ${g.status}：舊 IP 不能再用`)
      seen.add(g.headers['x-instance'])
    }
    assert.equal(seen.size, 3, `恢復 6 秒後只分到 ${seen.size} 個新副本：resolver 的 valid 要是 5s，nginx 才會定期重新查詢`)
  } finally {
    docker('rm', '-f', ...HOGS)
  }
})

test('某個副本「訂單寫進去了卻回 503」時，POST 不會被重送：每張訂單最多一筆', async () => {
  const f = await http('POST', '/test/fail?mode=503-after-write')
  assert.equal(f.status, 200, `開啟錯誤注入失敗：${JSON.stringify(f.body)}`)
  const tag = randomUUID().slice(0, 8)
  const statuses: number[] = []
  for (let i = 0; i < 30; i++) statuses.push((await http('POST', '/orders', { productId: 2, note: `ex2-${tag}-${i}` })).status)
  const dup = psql(`SELECT note || ' ×' || count(*) FROM orders WHERE note LIKE 'ex2-${tag}-%' GROUP BY note HAVING count(*) > 1`).stdout
  assert.equal(dup, '', `同一個請求產生了好幾筆訂單：${dup.split('\n').join('、')}。nginx 把 POST 重送給下一台了：proxy_next_upstream 不要加 non_idempotent，POST 失敗由客戶端帶冪等鍵自己決定要不要重試`)
  assert.ok(statuses.includes(503), `30 個 POST 都沒有打到故障的副本（${f.body.instance}），測不出效果：檢查 least_conn 與 3 個副本都在跑`)
})
