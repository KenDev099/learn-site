import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useRedis } from '../../helpers/redis.ts'
import { reclaimStuck } from './reclaim.ts'

const redis = useRedis(5)
const stream = 'ds:t05:reclaim'
const dead = 'ds:t05:reclaim:dead'
const group = 'receipts'
const ids: string[] = []

type Pending = [id: string, consumer: string, idleMs: number, deliveries: number]
const pending = async () => await redis.xpending(stream, group, '-', '+', 100) as Pending[]

describe('練習 3：接手卡住的訊息與 dead-letter', { timeout: 30_000 }, () => {
  test('還沒閒置到 minIdleMs 的訊息不接手', async () => {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM')
    for (let i = 0; i < 5; i++) ids.push(String(await redis.xadd(stream, '*', 'type', 'paid', 'orderId', String(40 + i))))
    await redis.xreadgroup('GROUP', group, 'A', 'COUNT', 10, 'STREAMS', stream, '>')   // A 讀了 5 筆就當機了
    const got = await reclaimStuck(redis, stream, group, 'B', 60_000, 3)
    assert.deepEqual(got, [], 'A 剛剛才讀，閒置不到 60 秒，不能接手：XAUTOCLAIM 的 min-idle-time 要用 minIdleMs')
    const p = await pending()
    assert.ok(p.length === 5 && p.every(p => p[1] === 'A'), '5 筆都還留在 PEL、屬於 A：沒接手的訊息不能 XACK')
  })

  test('A 消失後，B 接手 A 手上全部 5 筆', async () => {
    const got = await reclaimStuck(redis, stream, group, 'B', 0, 3)
    assert.deepEqual(got.map(m => m.id), ids, `B 要拿到 A 手上的 5 筆，實際拿到 ${got.length} 筆：XREADGROUP … > 只讀得到新訊息，別人 PEL 裡的要用 XAUTOCLAIM`)
    assert.deepEqual(got[2].fields, { type: 'paid', orderId: '42' }, 'fields 要轉成物件')
    const p = await pending()
    assert.ok(p.length === 5 && p.every(p => p[1] === 'B'), '接手之後，這 5 筆都還在 PEL、屬於 B：回傳給呼叫的人重新處理的訊息還不能 XACK，處理成功才 ACK')
    for (const id of ids) if (id !== ids[2]) await redis.xack(stream, group, id)   // 只有 42 號一直處理失敗
  })

  test('一直失敗的 42 號：送達超過 3 次後移到 dead-letter stream 並 ACK', async () => {
    const second = await reclaimStuck(redis, stream, group, 'B', 0, 3)
    assert.deepEqual(second.map(m => m.id), [ids[2]], '42 號第 3 次送達（≤ 3），還要再交給 handle 試一次')
    const third = await reclaimStuck(redis, stream, group, 'B', 0, 3)
    assert.deepEqual(third, [], '42 號第 4 次送達，超過 maxDeliveries 3：不能再回傳，不然毒訊息會無限重送')
    const moved = await redis.xrange(dead, '-', '+')
    assert.equal(moved.length, 1, `42 號要寫到 ${dead}`)
    const list = moved[0][1], fields: Record<string, string> = {}
    for (let i = 0; i < list.length; i += 2) fields[list[i]] = list[i + 1]
    assert.equal(fields.orderId, '42', 'dead-letter 那筆要保留原本的欄位（orderId）')
    assert.equal(fields.type, 'paid', 'dead-letter 那筆要保留原本的欄位（type）')
    assert.equal(fields.originalId, ids[2], 'dead-letter 那筆要有 originalId 欄位，記錄原本的 id')
    assert.deepEqual(await pending(), [], '移到 dead-letter 之後要 XACK，不然它永遠留在 PEL')
  })

  test('送達次數以 Redis 記錄的為準：換一個 worker 也一樣', async () => {
    const id = String(await redis.xadd(stream, '*', 'type', 'paid', 'orderId', '45'))
    await redis.xreadgroup('GROUP', group, 'A', 'COUNT', 10, 'STREAMS', stream, '>')
    for (let i = 0; i < 3; i++) await redis.xclaim(stream, group, 'X', 0, id)   // 別的 worker 已經接手過 3 次：送達次數 4
    const got = await reclaimStuck(redis, stream, group, 'C', 0, 3)
    assert.deepEqual(got, [], '45 號在 Redis 記錄的送達次數已經超過 3：送達次數要用 XPENDING 查，不能用自己記在記憶體裡的次數（重啟或換 worker 就歸零）')
    assert.equal((await redis.xrange(dead, '-', '+')).length, 2, '45 號也要移到 dead-letter stream')
    assert.deepEqual(await pending(), [], '45 號移走後也要 XACK')
  })

  test('PEL 很多筆時要一直 XAUTOCLAIM 到游標回 0-0，全部接手', async () => {
    const big = 'ds:t05:reclaim-big'
    await redis.xgroup('CREATE', big, group, '0', 'MKSTREAM')
    const bigIds: string[] = []
    for (let i = 0; i < 250; i++) bigIds.push(`${1_793_000_000_000 + i}-0`)
    const pipe = redis.pipeline()
    for (const id of bigIds) pipe.xadd(big, id, 'type', 'paid', 'orderId', id)
    await pipe.exec()
    await redis.xreadgroup('GROUP', group, 'A', 'COUNT', 1000, 'STREAMS', big, '>')
    const got = await reclaimStuck(redis, big, group, 'B', 0, 3)
    assert.equal(got.length, 250, `A 手上有 250 筆，只接手到 ${got.length} 筆：XAUTOCLAIM 一次最多 COUNT 筆，要用回覆的第一項當下一次的起點，一直呼叫到回 0-0`)
    assert.deepEqual(got.map(m => m.id), bigIds, '每一筆都要接手，而且依 id 順序')
  })
})
