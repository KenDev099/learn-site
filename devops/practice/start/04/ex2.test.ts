// 練習 2：用 CoreDNS 當 cafe.test 的權威 DNS，檢查 zone 檔裡的紀錄
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { Resolver } from 'node:dns/promises'
import { docker, removeContainers, requireDocker } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-04-dns'
const OLD_SERIAL = 2026110101
const dns = new Resolver({ timeout: 1_000, tries: 2 })
dns.setServers(['127.0.0.1:18045'])

const logs = () => { const l = docker('logs', NAME); return (l.stdout + '\n' + l.stderr).trim() }

before(async () => {
  requireDocker()
  removeContainers(NAME)
  const r = docker('run', '-d', '--name', NAME, '-p', '127.0.0.1:18045:53/udp',
    '-v', `${dir}:/zones:ro`, 'coredns/coredns:1.15.0', '-conf', '/zones/Corefile')
  assert.equal(r.code, 0, `啟動 CoreDNS 失敗：${r.stderr}`)
  // 等 CoreDNS 載入 zone 檔：SOA 查得到就代表好了
  const end = Date.now() + 60_000
  for (;;) {
    try { await dns.resolveSoa('cafe.test'); return } catch (e) {
      if (Date.now() > end) throw new Error(`CoreDNS 60 秒內沒有回答 cafe.test 的 SOA，多半是 zone 檔語法錯了。docker logs ld-04-dns：\n${logs()}`)
      await new Promise(r => setTimeout(r, 300))
    }
  }
})
after(() => removeContainers(NAME))

test('api.cafe.test 的 A 紀錄是 10.0.1.10，TTL 300 秒', async () => {
  const a = await dns.resolve4('api.cafe.test', { ttl: true }).catch(e => assert.fail(`查不到 api.cafe.test 的 A 紀錄（${e.code}）：加一行 api 300 IN A 10.0.1.10`))
  assert.deepEqual(a.map(x => x.address), ['10.0.1.10'], 'api 的 A 紀錄只有一筆：10.0.1.10')
  assert.equal(a[0].ttl, 300, `TTL 是 ${a[0].ttl}：沒寫 TTL 會用 $TTL 的 3600，要在名稱後面寫 300`)
})

test('www.cafe.test 是 CNAME，指向 api.cafe.test，最後解析成 10.0.1.10', async () => {
  const c = await dns.resolveCname('www.cafe.test').catch(e => assert.fail(`查不到 www.cafe.test 的 CNAME（${e.code}）：加一行 www IN CNAME …`))
  assert.deepEqual(c, ['api.cafe.test'], `CNAME 指向 ${c}：目標要寫完整名稱並以點結尾（api.cafe.test.），沒有點會被接上 $ORIGIN`)
  assert.deepEqual(await dns.resolve4('www.cafe.test'), ['10.0.1.10'], '查 www 的 A 紀錄要跟著 CNAME 得到 10.0.1.10')
})

test('cafe.test 的 TXT 紀錄是 v=spf1 -all（一個完整字串）', async () => {
  const t = await dns.resolveTxt('cafe.test').catch(e => assert.fail(`查不到 cafe.test 的 TXT（${e.code}）：名稱用 @ 代表 cafe.test 本身`))
  assert.ok(t.some(r => r.length === 1 && r[0] === 'v=spf1 -all'), `查到 ${JSON.stringify(t)}：內容有空白，要用雙引號包起來："v=spf1 -all"`)
})

test('SOA 序號比原本的 2026110101 大', async () => {
  const soa = await dns.resolveSoa('cafe.test')
  assert.ok(soa.serial > OLD_SERIAL, `序號還是 ${soa.serial}：改了 zone 檔就要把 serial 加大，次要 DNS 伺服器和 CoreDNS 的 reload 都看它判斷有沒有新版本`)
})
