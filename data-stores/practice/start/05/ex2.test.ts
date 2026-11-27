import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { consume, type StreamMessage } from './receipts-worker.ts'

const redis = useRedis(5)
const stream = 'ds:t05:receipts'
const group = 'receipts'
const handled: { consumer: string, msg: StreamMessage }[] = []
const ids: string[] = []
const handler = (consumer: string) => async (msg: StreamMessage) => { handled.push({ consumer, msg }) }
const pendingCount = async () => Number((await redis.xpending(stream, group))[0])

describe('練習 2：寄收據的 worker（consumer group）', { timeout: 30_000 }, () => {
  test('第一次執行時建立 group，從 stream 的開頭讀', async () => {
    for (let i = 0; i < 20; i++) ids.push(String(await redis.xadd(stream, '*', 'type', 'paid', 'orderId', String(10 + i))))
    const n = await consume(redis, { stream, group, consumer: 'w1', handle: handler('w1'), count: 5 })
    const groups = await redis.xinfo('GROUPS', stream) as unknown[][]
    assert.equal(groups.length, 1, `consume 要自己建立 group（XGROUP CREATE ${stream} ${group} 0 MKSTREAM）`)
    assert.equal(n, 5, `worker 啟動前已經有 20 筆事件，第一批（count 5）要讀到 5 筆，實際回傳 ${n}：group 要從 0 開始讀，用 $ 只會讀到建立之後的新訊息`)
    assert.deepEqual(handled.map(h => h.msg.id), ids.slice(0, 5), '要依 stream 的順序把前 5 筆交給 handle')
    assert.deepEqual(handled[0].msg.fields, { type: 'paid', orderId: '10' }, 'fields 要從 ["type","paid","orderId","10"] 轉成物件')
  })

  test('handle 成功後 XACK，PEL 是空的；再次執行不會因為 group 已存在而出錯', async () => {
    assert.equal(await pendingCount(), 0, '處理成功的 5 筆都要 XACK，PEL 要是空的')
    try {
      await consume(redis, { stream, group, consumer: 'w1', handle: handler('w1'), count: 1 })
    } catch (e) {
      assert.fail(`group 已經存在時再呼叫 consume 出錯了（${(e as Error).message}）：XGROUP CREATE 回 BUSYGROUP 要忽略，其他錯誤才往外丟`)
    }
  })

  test('兩個 worker 一起跑：每筆恰好處理一次，兩個都有分到', async () => {
    for (let round = 0; round < 20; round++) {
      const [n1, n2] = await Promise.all([
        consume(redis, { stream, group, consumer: 'w1', handle: handler('w1'), count: 3 }),
        consume(redis, { stream, group, consumer: 'w2', handle: handler('w2'), count: 3 }),
      ])
      if (n1 === 0 && n2 === 0) break
    }
    const seen = handled.map(h => h.msg.id)
    const dup = seen.filter((id, i) => seen.indexOf(id) !== i)
    assert.deepEqual(dup, [], `有事件被處理了不只一次（${dup.length} 次重複）：要用 XREADGROUP … > 讀，同一個 group 裡每筆只會交給一個消費者；XREAD 每個人都會讀到全部`)
    assert.deepEqual([...seen].sort(), [...ids].sort(), '20 筆事件每一筆都要被處理')
    assert.ok(handled.some(h => h.consumer === 'w2'), 'w2 也要分到訊息')
    assert.equal(await pendingCount(), 0, '全部成功，PEL 要是空的')
  })

  test('handle 丟錯的那筆不 ACK，留在 PEL；同一批的其他筆照樣處理', async () => {
    const extra: string[] = []
    for (const orderId of ['30', '31', '32']) extra.push(String(await redis.xadd(stream, '*', 'type', 'paid', 'orderId', orderId)))
    const ok: string[] = []
    let n: number
    try {
      n = await consume(redis, {
        stream, group, consumer: 'w3', count: 10,
        handle: async msg => {
          if (msg.fields.orderId === '31') throw new Error('寄信失敗')
          ok.push(msg.fields.orderId)
        },
      })
    } catch (e) {
      assert.fail(`handle 丟錯時 consume 不能跟著丟錯（${(e as Error).message}）：記下來、不 ACK，繼續處理下一筆`)
    }
    assert.equal(n, 3, 'consume 要回傳這一批讀到幾筆（3）')
    assert.deepEqual(ok, ['30', '32'], '31 失敗之後，32 還是要處理')
    const pending = await redis.xpending(stream, group, '-', '+', 10) as [string, string, number, number][]
    assert.deepEqual(pending.map(p => [p[0], p[1]]), [[extra[1], 'w3']], '只有處理失敗的 31 號留在 PEL（屬於 w3）：成功才 XACK，不能讀了就 ACK、也不能不管成敗都 ACK')
  })
})
