// 練習 2：類正式環境：compose.prod.yaml 與 nginx/default.conf
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect, requireDocker, run } from '../../helpers/docker.ts'
import { HTTP, HTTPS, dc, hit, load, psql, reset, runAsync, sleep, up, why } from './lib.ts'

const dir = import.meta.dirname
let started = { code: 0 as number | null, stdout: '', stderr: '' }

before(() => {
  requireDocker()
  reset(dir)
  started = up(dir)
})
after(() => reset(dir))

const ok = () => assert.equal(started.code, 0, `sh up.sh 失敗，有服務沒有變成 healthy：\n${why(started)}\n用 docker compose -f compose.prod.yaml ps -a 與 logs <服務> 看是哪一個`)
// 某個服務的容器 id
const ids = (service: string) => dc(dir, 'ps', '-q', service).stdout.split('\n').filter(Boolean)

test('sh up.sh 成功：db、redis、migrate、api-blue、api-green、nginx 都起來了', () => {
  ok()
  for (const s of ['db', 'redis', 'api-blue', 'api-green', 'nginx']) assert.ok(ids(s).length, `找不到 ${s} 的容器`)
  for (const s of ['api-blue', 'api-green']) assert.equal(ids(s).length, 2, `${s} 要有 2 個副本（deploy.replicas: 2）：一個副本重啟時另一個接住`)
  const m = run('docker', ['compose', '-f', 'compose.prod.yaml', 'ps', '-a', '--format', '{{.Service}} {{.State}} {{.ExitCode}}'], { cwd: dir }).stdout
  assert.match(m, /^migrate exited 0$/m, `migrate 要是跑完就結束（exit 0）的一次性服務：\n${m}`)
})

test('HTTPS 用 certs/ca.crt 驗證通過，回應帶 HSTS', async () => {
  ok()
  const r = await hit(dir, HTTPS + '/version')
  assert.equal(r.status, 200, `https://localhost:18263/version 回 ${r.status}`)
  assert.equal(JSON.parse(r.body).version, '1.0.0')
  assert.match(r.headers['strict-transport-security'] ?? '', /max-age=\d{7,}/, 'HTTPS 的回應要有 Strict-Transport-Security: max-age=…（至少幾個月，例如 31536000）')
})

test('HTTP 一律 301 轉到 HTTPS，而且不帶 HSTS', async () => {
  ok()
  const r = await hit(dir, HTTP + '/products?x=1')
  assert.equal(r.status, 301, `http://localhost:18260/products 回 ${r.status}，要 301`)
  assert.equal(r.headers.location, 'https://localhost:18263/products?x=1', `Location 是 ${r.headers.location}：要保留路徑和查詢字串，轉到 HTTPS 的 18263`)
  assert.equal(r.headers['strict-transport-security'], undefined, 'HTTP 回應帶了 HSTS：瀏覽器只認 HTTPS 回應裡的 HSTS，放在 HTTP 沒有效果，也表示 add_header 放錯了地方')
})

test('/metrics 不對外：經過 nginx 拿到 403 或 404', async () => {
  ok()
  const r = await hit(dir, HTTPS + '/metrics')
  assert.ok(r.status === 403 || r.status === 404, `https://localhost:18263/metrics 回 ${r.status}：指標只給內部的 Prometheus 抓，對外要擋掉（location = /metrics { return 404; }）`)
})

test('上傳上限 5MB：4MB 可以，6MB 由 nginx 回 413', async () => {
  ok()
  const small = await hit(dir, HTTPS + '/uploads', { method: 'POST', body: Buffer.alloc(4 * 1024 * 1024) })
  assert.equal(small.status, 200, `4MB 的上傳回 ${small.status}：nginx 預設 client_max_body_size 只有 1m，要改成 5m`)
  const big = await hit(dir, HTTPS + '/uploads', { method: 'POST', body: Buffer.alloc(6 * 1024 * 1024) }).catch(e => ({ status: 0, headers: {} as Record<string, string>, body: String(e) }))
  assert.equal(big.status, 413, `6MB 的上傳回 ${big.status}，要 413`)
  assert.match(big.headers.server ?? '', /nginx/, '413 要由 nginx 回（在最前面就擋下，不讓大檔案進到 api）')
})

test('限流：正常的速度不會 429，同一個 IP 瞬間 300 個請求會有 429', async () => {
  ok()
  const paced: number[] = []
  for (let i = 0; i < 30; i++) { paced.push((await hit(dir, HTTPS + '/products')).status); await sleep(25) }
  assert.ok(paced.every(s => s === 200), `每秒約 30 個請求就出現 ${paced.filter(s => s !== 200).join('、')}：限流太嚴，壓測（每秒 36 個）會過不了`)
  const burst = await Promise.all(Array.from({ length: 300 }, () => hit(dir, HTTPS + '/health/live').then(r => r.status, () => 0)))
  assert.ok(burst.includes(429), `300 個同時的請求沒有任何 429（${[...new Set(burst)].join('、')}）：用 limit_req_zone $binary_remote_addr、limit_req … burst=… nodelay、limit_req_status 429`)
  assert.ok(!burst.some(s => s >= 500), `瞬間的大量請求出現 5xx：${[...new Set(burst)].join('、')}`)
})

test('db 與 redis 沒有發布 port', () => {
  ok()
  for (const s of ['db', 'redis']) for (const id of ids(s)) {
    const ports = Object.values<any>(inspect(id)?.NetworkSettings?.Ports ?? {}).filter(Boolean).flat()
    assert.equal(ports.length, 0, `${s} 發布了 port（${ports.map((p: any) => `${p.HostIp}:${p.HostPort}`).join('、')}）：只有同一個 compose 網路的服務需要連它`)
  }
})

test('api 用 cafe_app 連線，密碼從 secrets 檔案讀，不在環境變數裡', async () => {
  ok()
  for (let i = 0; i < 6; i++) await hit(dir, HTTPS + '/products')
  const users = psql(dir, "SELECT DISTINCT usename FROM pg_stat_activity WHERE backend_type = 'client backend' AND usename <> 'postgres' ORDER BY 1")
  assert.equal(users.code, 0, users.stderr)
  assert.equal(users.stdout, 'cafe_app', `連進資料庫的帳號有：${users.stdout.replace(/\n/g, '、') || '（沒有）'}。api 只能用 cafe_app；cafe_migrator 能建表、改表，只給 migrate 用`)
  const secret = readFileSync(join(dir, 'secrets', 'app_password.txt'), 'utf8').trim()
  for (const id of [...ids('api-blue'), ...ids('api-green')]) {
    const env: string[] = inspect(id).Config.Env
    assert.ok(!env.some(e => e.includes(secret)), '密碼出現在 api 的環境變數裡：docker inspect 看得到。用 secrets 掛檔案，設定 DB_PASSWORD_FILE')
    assert.ok(env.includes('DB_PASSWORD_FILE=/run/secrets/app_password'), 'api 要設定 DB_PASSWORD_FILE=/run/secrets/app_password')
  }
  const create = dc(dir, 'exec', '-T', 'db', 'psql', '-XAtq', '-U', 'cafe_app', '-d', 'cafe', '-c', 'CREATE TABLE ld_probe (id int)')
  assert.notEqual(create.code, 0, 'cafe_app 可以建表：權限太大了')
})

test('api 有資源限制與 log 輪替', () => {
  ok()
  for (const s of ['api-blue', 'api-green', 'nginx']) for (const id of ids(s)) {
    const host = inspect(id).HostConfig
    assert.ok(host.Memory > 0, `${s} 沒有記憶體上限：一個副本漏記憶體會拖垮整台機器（deploy.resources.limits.memory）`)
    assert.equal(host.LogConfig.Type, 'json-file')
    assert.ok(host.LogConfig.Config?.['max-size'], `${s} 的 log 沒有 max-size：log 會一直長到磁碟滿（logging.options.max-size、max-file）`)
  }
})

test('購物車存在 Redis：同一個 cookie 打到不同副本，看到的內容一樣', async () => {
  ok()
  const add = await hit(dir, HTTPS + '/cart/items', { method: 'POST', body: JSON.stringify({ productId: 3 }), headers: { 'content-type': 'application/json' } })
  assert.equal(add.status, 201, `POST /cart/items 回 ${add.status}：${add.body}`)
  const cookie = String(add.headers['set-cookie']).split(';')[0]
  const instances = new Set<string>()
  for (let i = 0; i < 8; i++) {
    const r = await hit(dir, HTTPS + '/cart', { headers: { cookie } })
    instances.add(r.headers['x-instance'])
    assert.deepEqual(JSON.parse(r.body).items, [3], `第 ${i + 1} 次 GET /cart 的內容不一樣：${r.body}`)
  }
  assert.ok(instances.size >= 2, `8 個請求都打到同一個副本（${[...instances].join('、')}）：nginx 的 upstream 要用 active.conf 裡的 api，輪流分給副本`)
})

test('在持續負載下把 api-blue 從 2 個縮到 1 個，沒有任何失敗的請求', async () => {
  ok()
  const l = load(dir, 20)
  await sleep(1000)
  // runAsync：指令執行期間，背景的負載照樣送
  const down = await runAsync('docker', ['compose', '-f', 'compose.prod.yaml', 'up', '-d', '--no-deps', '--wait', '--scale', 'api-blue=1', 'api-blue'], { cwd: dir })
  await sleep(3000)
  await l.stop()
  dc(dir, 'up', '-d', '--no-deps', '--wait', 'api-blue')   // 擴回 2 個（不在負載下量）
  assert.equal(down.code, 0, down.stderr)
  assert.ok(l.sent > 50, '負載沒有送出去')
  assert.deepEqual(l.failures, [], `縮減期間有 ${l.failures.length} 個請求失敗：被收掉的副本要先排空，DRAIN_MS 要比 nginx resolver 的 valid（5 秒）長，stop_grace_period 要比排空時間長：\n${l.failures.slice(0, 5).join('\n')}`)
})
