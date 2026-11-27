import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Redis } from 'ioredis'
import { newRedis, useRedis } from '../../helpers/redis.ts'
import { publishReady, READY_CHANNEL, subscribeReady, type ReadyMessage } from './notify.ts'

const redis = useRedis(5)
const raw = newRedis(5)   // 測試自己的訂閱者：看頻道上實際送出的字串
const AT = 1_793_000_000_000

// 傳給 subscribeReady 的 redis：記下 duplicate() 開出來的連線，測試結束時一定關掉（沒關好的連線會讓測試程序結束不了）
const opened: Redis[] = []
const shared = new Proxy(redis, {
  get(t, prop, receiver) {
    if (prop !== 'duplicate') return Reflect.get(t, prop, receiver)
    return (...args: Parameters<Redis['duplicate']>) => {
      const conn = t.duplicate(...args)
      opened.push(conn)
      return conn
    }
  },
})
after(() => { for (const conn of opened) conn.disconnect() })

// DB 5 上的連線（只有第 5 課的測試用 DB 5）：id → 訂閱了幾個頻道
async function db5Clients(): Promise<Map<string, number>> {
  const list = String(await redis.call('CLIENT', 'LIST'))
  const map = new Map<string, number>()
  for (const line of list.split('\n')) {
    if (!/ db=5 /.test(line)) continue
    map.set(line.match(/^id=(\d+)/)![1], Number(line.match(/ sub=(\d+)/)?.[1] ?? 0))
  }
  return map
}

async function until(check: () => boolean | Promise<boolean>, message: string, ms = 5_000) {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) assert.fail(message)
    await sleep(50)
  }
}

let baseline = new Map<string, number>()
let newIds: string[] = []
const a: ReadyMessage[] = [], b: ReadyMessage[] = []
let unsubA = async () => {}, unsubB = async () => {}

describe('練習 1：飲料做好的通知（pub/sub）', { timeout: 30_000 }, () => {
  test('publishReady 把 JSON 送到 ds:t05:ready，回傳收到的訂閱者數', async () => {
    assert.equal(await publishReady(redis, 10, AT), 0, '沒有人訂閱時，PUBLISH 回 0（訊息直接丟掉）；publishReady 要回傳 PUBLISH 的回覆')
    const got: string[] = []
    raw.on('message', (channel: string, message: string) => { if (channel === READY_CHANNEL) got.push(message) })
    await raw.subscribe(READY_CHANNEL)
    assert.equal(await publishReady(redis, 11, AT), 1, '有 1 個訂閱者時，publishReady 要回傳 1')
    await until(() => got.length === 1, `訂閱 ${READY_CHANNEL} 的人沒收到訊息：頻道名稱要用 READY_CHANNEL`)
    let parsed: unknown
    try { parsed = JSON.parse(got[0]) } catch { assert.fail(`訊息要是 JSON 字串，收到 ${JSON.stringify(got[0])}：用 JSON.stringify({ orderId, at })`) }
    assert.deepEqual(parsed, { orderId: 11, at: AT }, '訊息內容要是 {"orderId":11,"at":…}，兩個都是數字')
    await raw.unsubscribe(READY_CHANNEL)
  })

  test('subscribeReady 另開一條連線訂閱，兩個訂閱者都依序收到 3 則', async () => {
    baseline = await db5Clients()
    unsubA = await subscribeReady(shared, m => { a.push(m) })
    unsubB = await subscribeReady(shared, m => { b.push(m) })
    const now = await db5Clients()
    newIds = [...now.keys()].filter(id => !baseline.has(id))
    assert.equal(newIds.length, 2, `呼叫兩次 subscribeReady，DB 5 應該多出 2 條連線，實際多了 ${newIds.length} 條：每次都要用 redis.duplicate() 另開一條連線來訂閱，不要拿傳進來的共用連線訂閱`)
    for (const id of newIds) assert.equal(now.get(id), 1, '新開的連線要訂閱 1 個頻道（READY_CHANNEL）')
    assert.equal(await publishReady(redis, 12, AT), 2, 'subscribeReady 回傳時訂閱要已經生效（await subscribe），這時發布要有 2 個訂閱者收到')
    await publishReady(redis, 13, AT + 1)
    await publishReady(redis, 14, AT + 2)
    await until(() => a.length >= 3 && b.length >= 3, `兩個訂閱者各應該收到 3 則，實際收到 ${a.length} 和 ${b.length} 則`)
    const expected = [{ orderId: 12, at: AT }, { orderId: 13, at: AT + 1 }, { orderId: 14, at: AT + 2 }]
    assert.deepEqual(a, expected, 'onMessage 要收到 JSON.parse 之後的物件，順序和發布的順序一樣')
    assert.deepEqual(b, expected, '第二個訂閱者也要收到同樣的 3 則')
  })

  test('取消訂閱會關掉那條連線，之後不再收到訊息', async () => {
    await unsubA()
    await unsubB()
    await until(async () => {
      const now = await db5Clients()
      return newIds.every(id => !now.has(id))
    }, '取消訂閱之後，訂閱用的連線還開著：除了 unsubscribe，還要 quit() 關掉這條連線，不然每訂閱一次就漏一條連線')
    assert.equal(await publishReady(redis, 15, AT + 3), 0, '兩個都取消訂閱之後，沒有人收得到')
    await sleep(200)
    assert.equal(a.length, 3, '取消訂閱之後不能再呼叫 onMessage')
  })

  test('沒人訂閱時發布的訊息就消失了，之後才訂閱的人收不到', async () => {
    assert.equal(await publishReady(redis, 16, AT + 4), 0)
    const late: ReadyMessage[] = []
    const unsub = await subscribeReady(shared, m => { late.push(m) })
    await sleep(300)
    await unsub()
    assert.deepEqual(late, [], 'pub/sub 不會保存訊息：訂閱之前發布的 16 號不會補送')
  })
})
