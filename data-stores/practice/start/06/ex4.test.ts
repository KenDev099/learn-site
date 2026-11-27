import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { deleteBig, findBigKeys } from './bigkeys.ts'

const redis = useRedis(6)

const SET = 'ds:visitors:2026-11'           // 5 萬個成員的 set
const HASH = 'ds:orders:by-customer'        // 2 萬個欄位的 hash
const OUTSIDE = 'tmp:import:backup'         // 很大，但不符合 pattern
const THRESHOLD = 200_000

// 記下送到 Redis 的每個指令（pipeline 裡的也算）；SCAN 另外記下回傳的 cursor
function spy(client: Redis) {
  const sent: { name: string, args: string[] }[] = []
  const cursors: string[] = []
  const proxy = new Proxy(client, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver)
      if (prop !== 'sendCommand' || typeof value !== 'function') return value
      return function (this: unknown, command: { name: string, args: unknown[], promise: Promise<unknown> }, ...rest: unknown[]) {
        const name = command.name.toLowerCase()
        sent.push({ name, args: command.args.map(String) })
        if (name === 'scan') command.promise.then(r => cursors.push(String((r as unknown[])[0])), () => {})
        return Reflect.apply(value, this, [command, ...rest])
      }
    },
  })
  return { proxy, sent, cursors }
}

describe('練習 4：找出並刪除大 key', { timeout: 60_000 }, () => {
  before(async () => {
    const p = redis.pipeline()
    for (let i = 0; i < 50_000; i += 5_000) p.sadd(SET, ...Array.from({ length: 5_000 }, (_, j) => `customer:${10_000 + i + j}`))
    for (let i = 0; i < 20_000; i += 5_000) p.hset(HASH, Object.fromEntries(Array.from({ length: 5_000 }, (_, j) => [`c${10 + i + j}`, `{"orders":${i + j},"total":${(i + j) * 110}}`])))
    for (let i = 0; i < 30_000; i += 5_000) p.sadd(OUTSIDE, ...Array.from({ length: 5_000 }, (_, j) => `row:${i + j}`))
    for (let i = 10; i < 2_010; i += 500) p.mset(Object.fromEntries(Array.from({ length: 500 }, (_, j) => [`ds:menu:${i + j}`, `{"id":${i + j},"price":110}`])))
    p.set('ds:receipt:10', 'r'.repeat(50_000))   // 中等大小，沒有超過門檻
    for (const [e] of (await p.exec()) ?? []) if (e) throw e
  })

  test('只回傳超過門檻、符合 pattern 的 key，依大小由大到小', async () => {
    const { proxy, sent, cursors } = spy(redis)
    const result = await findBigKeys(proxy, 'ds:*', THRESHOLD, 100)
    const setBytes = Number(await redis.memory('USAGE', SET)), hashBytes = Number(await redis.memory('USAGE', HASH))
    const expected = [[SET, setBytes], [HASH, hashBytes]].sort((a, b) => Number(b[1]) - Number(a[1])).map(([k]) => k)

    const names = sent.map(c => c.name)
    assert.ok(!names.includes('keys'), 'findBigKeys 用了 KEYS：KEYS 一次走完所有 key，key 多的時候整台 Redis 會停住，要用 SCAN')
    assert.deepEqual(result.map(r => r.key), expected,
      `回傳的 key 是 ${JSON.stringify(result.map(r => r.key))}，應該是 ${JSON.stringify(expected)}（只有 set 和 hash 超過 ${THRESHOLD} bytes，依 bytes 由大到小；STRLEN 只能量 string）`)
    for (const r of result) {
      const real = r.key === SET ? setBytes : hashBytes
      assert.equal(typeof r.bytes, 'number', `${r.key} 的 bytes 要是數字`)
      assert.ok(r.bytes > real / 2 && r.bytes < real * 2, `${r.key} 的 bytes 是 ${r.bytes}，MEMORY USAGE 量到約 ${real}：大小要用 MEMORY USAGE 量`)
    }
    const scans = sent.filter(c => c.name === 'scan')
    assert.ok(scans.length >= 2, `只呼叫了 ${scans.length} 次 SCAN：2,000 多個 key、COUNT 100 要走很多輪`)
    for (const s of scans) assert.ok(s.args.includes('100') && s.args.some(a => /^count$/i.test(a)), `SCAN 的參數是 ${s.args.join(' ')}：要用 COUNT scanCount（測試傳 100）`)
    assert.equal(cursors.at(-1), '0', `最後一次 SCAN 回傳的 cursor 是 ${cursors.at(-1)}：要一直走到 cursor 回到 '0' 才停`)
    assert.ok(names.includes('memory'), '要用 MEMORY USAGE 量每個 key 的大小')
    const other = [...new Set(names.filter(n => n !== 'scan' && n !== 'memory'))]
    assert.deepEqual(other, [], `findBigKeys 只需要 SCAN 和 MEMORY USAGE，卻送出了 ${other.join('、')}（用 EVAL 在 Lua 裡呼叫 KEYS 一樣會阻塞整台 Redis）`)
  })

  test('門檻不含等於：大小剛好等於門檻的 key 不算', async () => {
    const setBytes = Number(await redis.memory('USAGE', SET)), hashBytes = Number(await redis.memory('USAGE', HASH))
    const [small, big] = setBytes < hashBytes ? [SET, HASH] : [HASH, SET]
    const result = await findBigKeys(redis, 'ds:*', Math.min(setBytes, hashBytes), 500)
    assert.deepEqual(result.map(r => r.key), [big], `門檻設成 ${small} 的大小（${Math.min(setBytes, hashBytes)} bytes）時，只有 ${big} 超過；要用 bytes > thresholdBytes，不是 >=`)
  })

  test('沒有符合條件的 key 時回傳空陣列', async () => {
    assert.deepEqual(await findBigKeys(redis, 'ds:*', 50_000_000, 500), [], '門檻 50 MB 時沒有任何 key 超過')
    assert.deepEqual(await findBigKeys(redis, 'nothing:*', 0, 500), [], '沒有 key 符合 pattern 時回傳 []')
  })

  test('deleteBig 用 UNLINK 刪除', async () => {
    const { proxy, sent } = spy(redis)
    assert.equal(await deleteBig(proxy, SET), 1, '刪掉一個 key 要回傳 1')
    assert.equal(await redis.exists(SET), 0, `${SET} 要被刪掉`)
    const names = sent.map(c => c.name)
    assert.ok(!names.includes('del'), 'deleteBig 用了 DEL：DEL 在主執行緒釋放 5 萬個成員，期間 Redis 不處理別的指令；用 UNLINK')
    assert.deepEqual(names, ['unlink'], `deleteBig 只要送一個 UNLINK，實際送出：${names.join('、')}`)
    assert.equal(await deleteBig(proxy, SET), 0, '刪除不存在的 key 回傳 0')
  })
})
