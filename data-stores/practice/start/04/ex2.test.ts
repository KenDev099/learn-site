import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { newRedis, useRedis } from '../../helpers/redis.ts'
import { InsufficientPointsError, RetryExhaustedError, transferPoints } from './watch.ts'

const redis = useRedis(4)
const other = newRedis(4)   // 另一位使用者的連線
const points = async (id: number) => Number(await redis.get(`ds:points:${id}`) ?? 0)

describe('練習 2：轉移點數（WATCH／MULTI）', { timeout: 30_000 }, () => {
  test('一般的轉移：扣 from、加 to', async () => {
    await other.connect()
    await redis.set('ds:points:11', 100)
    await transferPoints(redis, 11, 12, 30)
    assert.equal(await points(11), 70, '顧客 11 原本 100 點，轉出 30 點後剩 70')
    assert.equal(await points(12), 30, '顧客 12 原本沒有點數（key 不存在當成 0），收到 30 點')
    await transferPoints(redis, 11, 12, 70)
    assert.equal(await points(11), 0, '剩 70 點時轉出 70 點要成功（點數剛好夠也算夠，用 balance < amount 判斷不夠）')
    assert.equal(await points(12), 100, '顧客 12 再收到 70 點，共 100 點')
  })

  test('點數不夠時丟 InsufficientPointsError，兩邊都不動', async () => {
    await redis.set('ds:points:13', 10)
    let execHook = 0
    await assert.rejects(transferPoints(redis, 13, 14, 50, { beforeExec: () => { execHook++ } }), InsufficientPointsError, '顧客 13 只有 10 點，轉 50 點要丟 InsufficientPointsError')
    assert.equal(await points(13), 10, '點數不夠時不能扣（不要先 EXEC 再檢查）')
    assert.equal(await redis.exists('ds:points:14'), 0, '點數不夠時不能加到 to')
    assert.equal(execHook, 0, '點數不夠就停下，不要走到 MULTI/EXEC')
    await other.set('ds:points:13', 20)   // 別人之後改了 ds:points:13
    const next = await redis.multi().set('ds:points:19', 1).exec()
    assert.notEqual(next, null, '丟 InsufficientPointsError 之前要 UNWATCH：不然這條連線還盯著 ds:points:13，下一個不相干的 MULTI 會莫名其妙失敗')
  })

  test('WATCH 之後被別人改了：EXEC 失敗，重新讀取再試一次', async () => {
    await redis.set('ds:points:15', 100)
    let calls = 0
    await transferPoints(redis, 15, 16, 30, {
      beforeExec: async () => {
        calls++
        if (calls === 1) await other.incrby('ds:points:15', 5)   // 另一個連線在你讀完、EXEC 之前加了 5 點
      },
    })
    assert.equal(calls, 2, `beforeExec 被呼叫 ${calls} 次：第一次 EXEC 時 ds:points:15 已經被別人改過，WATCH 要讓交易失敗並重試一次（WATCH 要和 MULTI/EXEC 用同一條連線）`)
    assert.equal(await points(15), 75, '100 ＋ 別人加的 5 － 轉出的 30 = 75')
    assert.equal(await points(16), 30, '顧客 16 收到 30 點')
  })

  test('一直被別人改：試 5 次後丟 RetryExhaustedError，不會無限重試', async () => {
    await redis.set('ds:points:17', 100)
    let calls = 0
    await assert.rejects(transferPoints(redis, 17, 18, 10, {
      beforeExec: async () => {
        calls++
        if (calls > 5) throw new Error(`第 ${calls} 次嘗試：重試要有上限（MAX_ATTEMPTS = 5）`)
        await other.incr('ds:points:17')
      },
    }), RetryExhaustedError, '每一次都被別人搶先修改，試滿 5 次後丟 RetryExhaustedError')
    assert.equal(calls, 5, `beforeExec 被呼叫 ${calls} 次，應該剛好試 5 次`)
    assert.equal(await points(17), 105, '一次都沒成功，只有別人加的 5 點')
    assert.equal(await redis.exists('ds:points:18'), 0, '一次都沒成功，to 不能收到點數')
  })

  test('20 條連線同時轉點：總數守恆，不會扣成負數', async () => {
    await redis.set('ds:points:21', 100)
    const conns = Array.from({ length: 20 }, () => newRedis(4))
    await Promise.all(conns.map(c => c.connect()))
    const results = await Promise.allSettled(conns.map(c => transferPoints(c, 21, 22, 10)))
    const from = await points(21), to = await points(22)
    assert.ok(from >= 0, `顧客 21 被扣到 ${from} 點：沒有 WATCH 時，大家都讀到 100 點、都覺得夠，一起扣下去`)
    assert.equal(from + to, 100, `總點數變成 ${from + to}：有人的修改被蓋掉了`)
    const ok = results.filter(r => r.status === 'fulfilled').length
    assert.equal(to, ok * 10, `成功 ${ok} 次，顧客 22 應該有 ${ok * 10} 點，實際 ${to}`)
    for (const r of results) if (r.status === 'rejected') assert.ok(r.reason instanceof RetryExhaustedError || r.reason instanceof InsufficientPointsError, `失敗只能是 RetryExhaustedError 或 InsufficientPointsError，收到 ${r.reason}`)
  })
})
