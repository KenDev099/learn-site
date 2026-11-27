import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Redis } from 'ioredis'
import { useRedis } from '../../helpers/redis.ts'
import { createSession, destroyAllForUser, destroySession, getSession, SESSION_TTL_MS } from './session.ts'

const redis = useRedis(3)
const ids: string[] = []

// 記下 destroyAllForUser 用了哪些指令
function recording(target: Redis) {
  const calls: string[] = []
  const proxy = new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const name = String(prop).toLowerCase()
        calls.push(name === 'call' || name === 'send_command' ? String(args[0]).toLowerCase() : name)
        return value.apply(t, args)
      }
    },
  }) as Redis
  return { proxy, calls }
}

describe('練習 3：伺服器端 session', { timeout: 30_000 }, () => {
  test('createSession 回傳 43 字元的 base64url 安全亂數，每次都不同', async () => {
    for (let i = 0; i < 3; i++) ids.push(await createSession(redis, 42, { role: 'member' }))
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{43}$/, `session id 要是 randomBytes(32) 的 base64url（43 個字元），收到 ${JSON.stringify(id)}；Math.random、遞增數字都猜得到`)
    assert.equal(new Set(ids).size, 3, '三個 session id 要都不同')
    const src = await readFile(new URL('./session.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(src, /Math\.random/, 'session id 不能用 Math.random 產生（不是密碼學安全的亂數，輸出可以被推算），用 node:crypto 的 randomBytes(32)')
  })

  test('session 存成 hash ds:session:<id>，30 分鐘後過期', async () => {
    assert.equal(await redis.type(`ds:session:${ids[0]}`), 'hash', 'ds:session:<id> 要是 hash（欄位 userId、role），不是一整個 JSON string')
    assert.deepEqual(await redis.hgetall(`ds:session:${ids[0]}`), { userId: '42', role: 'member' })
    const ttl = await redis.pttl(`ds:session:${ids[0]}`)
    assert.ok(Math.abs(ttl - SESSION_TTL_MS) < 5_000, `PTTL 要約 30 分鐘，收到 ${ttl}`)
    assert.ok(await redis.sismember('ds:user-sessions:42', ids[0]), '建立 session 時要把 id 加進 ds:user-sessions:42')
    const indexTtl = await redis.pttl('ds:user-sessions:42')
    assert.ok(Math.abs(indexTtl - SESSION_TTL_MS) < 5_000, `索引 ds:user-sessions:42 也要有約 30 分鐘的 TTL，收到 ${indexTtl}（-1 代表沒設：使用者不再登入，這個 set 就永遠留在 Redis）`)
  })

  test('getSession 回傳 { userId: number, role }，找不到回傳 null', async () => {
    assert.deepEqual(await getSession(redis, ids[1]), { userId: 42, role: 'member' }, 'userId 要轉成 number')
    assert.equal(await getSession(redis, 'no-such-session-id'), null)
  })

  test('getSession 把 TTL 延長回 30 分鐘（滑動過期）', async () => {
    await redis.pexpire(`ds:session:${ids[1]}`, 60_000)   // 模擬已經 29 分鐘沒動
    await redis.pexpire('ds:user-sessions:42', 60_000)
    await getSession(redis, ids[1])
    const ttl = await redis.pttl(`ds:session:${ids[1]}`)
    assert.ok(Math.abs(ttl - SESSION_TTL_MS) < 5_000, `getSession 之後 PTTL 要回到約 30 分鐘，收到 ${ttl}：每次使用都要 PEXPIRE`)
    const indexTtl = await redis.pttl('ds:user-sessions:42')
    assert.ok(Math.abs(indexTtl - SESSION_TTL_MS) < 5_000, `getSession 之後索引 ds:user-sessions:42 的 PTTL 也要回到約 30 分鐘，收到 ${indexTtl}：索引比 session 先過期，「登出所有裝置」就找不到還活著的 session`)
  })

  test('destroySession 只登出這一個 session', async () => {
    const other = await createSession(redis, 77, { role: 'barista' })
    await destroySession(redis, other)
    assert.equal(await getSession(redis, other), null)
    assert.equal(await redis.sismember('ds:user-sessions:77', other), 0, '登出後也要從 ds:user-sessions:77 移除這個 id')
    assert.deepEqual(await getSession(redis, ids[0]), { userId: 42, role: 'member' }, '別人的 session 不受影響')
  })

  test('destroyAllForUser 登出所有裝置，不用 KEYS／SCAN', async () => {
    const keep = await createSession(redis, 43, { role: 'member' })
    const { proxy, calls } = recording(redis)
    await destroyAllForUser(proxy, 42)
    for (const id of ids) assert.equal(await redis.exists(`ds:session:${id}`), 0, '使用者 42 的三個 session 都要刪掉')
    assert.equal(await redis.exists('ds:user-sessions:42'), 0, '索引 set ds:user-sessions:42 也要刪掉')
    assert.ok(!calls.some(c => ['keys', 'scan', 'scanstream'].includes(c)), `destroyAllForUser 用了 ${calls.join('、')}：不要用 KEYS 或 SCAN 掃整個 key 空間，從 ds:user-sessions:<userId> 拿到 id 再刪`)
    assert.deepEqual(await getSession(redis, keep), { userId: 43, role: 'member' }, '使用者 43 的 session 不受影響')
  })
})
