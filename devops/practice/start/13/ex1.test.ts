// 練習 1：購物車從記憶體搬到 Redis，3 個副本看到同一份
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { docker } from '../../helpers/docker.ts'
import { API, dir, http, reset, sleep, up } from './cluster.ts'

const sid = randomUUID()
const cookie = { cookie: `sid=${sid}` }
// 每次隨機挑 3 個商品，寫死的結果不會剛好對
const picks = Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 6))

before(() => { reset(); up() })
after(reset)

test('nginx 沒有用黏性 session（ip_hash、hash、sticky）遮掩狀態問題', () => {
  const conf = readFileSync(join(dir, 'nginx', 'default.conf'), 'utf8').replace(/#.*$/gm, '')
  const found = conf.match(/\b(ip_hash|hash|sticky)\b/)
  assert.equal(found, null, `nginx/default.conf 用了 ${found?.[0]}：把同一個人黏在同一個副本只是把問題藏起來，副本重啟或縮減時購物車還是會不見。把購物車搬到 Redis`)
})

test('3 個副本都在跑，請求會輪流分到不同副本', async () => {
  const seen = new Set<string>()
  for (let i = 0; i < 12; i++) seen.add((await http('GET', '/products')).headers['x-instance'])
  assert.equal(seen.size, 3, `12 個請求只分到 ${seen.size} 個副本：檢查 compose.yaml 的 replicas 和 nginx 設定`)
})

test('同一個 sid 加入 3 項商品後，連續 10 次 GET /cart 都看到同樣的 3 項', async () => {
  for (const productId of picks) {
    const r = await http('POST', '/cart/items', { productId }, cookie)
    assert.equal(r.status, 201, `POST /cart/items 回 ${r.status}：${JSON.stringify(r.body)}`)
  }
  for (let i = 0; i < 10; i++) {
    const r = await http('GET', '/cart', undefined, cookie)
    assert.deepEqual(r.body.items, picks,
      `第 ${i + 1} 次 GET /cart（副本 ${r.headers['x-instance']}）看到 ${JSON.stringify(r.body.items)}，應該是 ${JSON.stringify(picks)}：每個副本有自己的記憶體，購物車要存在共用的 Redis（cart:<sid>）`)
  }
})

test('重啟一個副本之後，購物車還在', async () => {
  const r = docker('restart', '-t', '10', API(2))
  assert.equal(r.code, 0, `docker restart ${API(2)} 失敗：${r.stderr}`)
  // 等它重新回應
  for (let i = 0; i < 50 && docker('exec', API(2), 'node', '-e', "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))").code !== 0; i++)
    await new Promise(res => setTimeout(res, 300))
  for (let i = 0; i < 9; i++) {
    const g = await http('GET', '/cart', undefined, cookie)
    assert.deepEqual(g.body.items, picks, `重啟 ${API(2)} 之後 GET /cart（副本 ${g.headers['x-instance']}）看到 ${JSON.stringify(g.body.items)}：存在程序或容器裡的資料，重啟就沒了`)
  }
})

test('Redis 裡的 cart:<sid> 有期限，大約 1 天', () => {
  const type = docker('exec', 'ld-13-redis-1', 'redis-cli', 'TYPE', `cart:${sid}`).stdout
  assert.notEqual(type, 'none', `Redis 裡找不到 cart:${sid}：key 要叫 cart:<sid>`)
  assert.equal(type, 'list', `cart:${sid} 的型別是 ${type}：用 list（RPUSH 加在尾端、LRANGE 依順序讀出）`)
  const ttl = Number(docker('exec', 'ld-13-redis-1', 'redis-cli', 'TTL', `cart:${sid}`).stdout)
  assert.ok(ttl > 0, `TTL cart:${sid} 是 ${ttl}（-1 表示永遠不過期）：每次加入商品都要設定期限，不然沒結帳的購物車會一直堆在 Redis 的記憶體裡`)
  assert.ok(ttl > 86_000 && ttl <= 86_400, `TTL 是 ${ttl} 秒，要是 1 天（86400 秒）`)
})

test('RPUSH 和 EXPIRE 用 multi() 包在同一個交易裡送出', async () => {
  // MONITOR 會印出 Redis 收到的每個指令，格式：時間 [db 來源] "指令" "參數"…
  const mon = spawn('docker', ['exec', 'ld-13-redis-1', 'redis-cli', 'MONITOR'])
  let out = ''
  mon.stdout.on('data', d => out += d)
  // redis-cli 連上後先印 OK，之後才開始轉送指令
  for (let i = 0; i < 50 && !/^OK/m.test(out); i++) await sleep(200)
  const other = randomUUID()
  const r = await http('POST', '/cart/items', { productId: 4 }, { cookie: `sid=${other}` })
  for (let i = 0; i < 25 && !/"exec"|"expire"/i.test(out.slice(out.indexOf(other))); i++) await sleep(200)
  await sleep(300)
  mon.kill()
  assert.equal(r.status, 201, `POST /cart/items 回 ${r.status}`)
  const key = `"cart:${other}"`
  // 指令名稱統一成大寫（ioredis 送的是小寫）
  const lines = out.split('\n').map(l => /\[\d+ ([^\]]+)\] "(\w+)"(.*)$/.exec(l)).filter(m => m !== null)
    .map(m => [m[0], m[1], `"${m[2].toUpperCase()}"${m[3]}`])
  const rpush = lines.find(m => m[2].startsWith(`"RPUSH" ${key}`))
  const expire = lines.find(m => /^"(EXPIRE|PEXPIRE|EXPIREAT|PEXPIREAT)"/.test(m[2]) && m[2].includes(key))
  assert.ok(rpush && expire, `MONITOR 沒看到這次加入商品的 RPUSH 和 EXPIRE ${key}`)
  // Lua 腳本裡的指令來源是 lua，本來就是一起執行的
  if (rpush[1] === 'lua' && expire[1] === 'lua') return
  const mine = lines.filter(m => m[1] === rpush[1]).map(m => m[2])
  const i = mine.indexOf(rpush[2]), j = mine.indexOf(expire[2])
  const multi = mine.lastIndexOf('"MULTI"', i)
  const exec = mine.indexOf('"EXEC"', i)
  assert.ok(multi >= 0 && exec > j && !mine.slice(multi + 1, i).includes('"EXEC"'),
    `RPUSH 和 EXPIRE 是分開送的（${mine.join(' → ')}）：兩個之間程序如果被停掉，就留下一個沒有期限的 key。用 redis.multi().rpush(…).expire(…).exec() 一起送出`)
})
