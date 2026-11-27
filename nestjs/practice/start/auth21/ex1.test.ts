// 練習 1：PasswordService（單元測試，不用資料庫）
import { argon2Sync, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { PasswordService } from './src/auth/password.service.js'

// 在 timingSafeEqual 外面包一層記錄：看 verify 有沒有真的用它比對雜湊
const tse = vi.hoisted(() => ({ spy: undefined as any }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  tse.spy = vi.fn(real.timingSafeEqual)
  return { ...real, timingSafeEqual: tse.spy, default: { ...real, timingSafeEqual: tse.spy } }
})

const svc = new PasswordService()
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/
const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '')
const make = (password: string, passes: number) => {
  const salt = randomBytes(16)
  const hash = argon2Sync('argon2id', { message: password, nonce: salt, tagLength: 32, memory: 19456, passes, parallelism: 1 })
  return `$argon2id$v=19$m=19456,t=${passes},p=1$${b64(salt)}$${b64(hash)}`
}

describe('練習 1：用 node:crypto 的 argon2id 雜湊密碼', () => {
  it('hash 回傳 PHC 字串：argon2id、m=19456、t=2、p=1、16 bytes salt、32 bytes 雜湊', async () => {
    const stored = await svc.hash('latte-110-please')
    expect(stored, '格式要是 $argon2id$v=19$m=19456,t=2,p=1$<22 字元 salt>$<43 字元雜湊>（base64 去掉 =）').toMatch(PHC)
    const [, m, t, p] = PHC.exec(stored)!
    expect([m, t, p], '參數要是 OWASP 的最低建議 m=19456、t=2、p=1').toEqual(['19456', '2', '1'])
  })

  it('字串裡的雜湊真的是 argon2id 用那組 salt 與參數算出來的', async () => {
    const stored = await svc.hash('拿鐵 110 元')
    const [, , , , salt, hash] = PHC.exec(stored) ?? []
    expect(salt, '先讓 hash 回傳正確的格式').toBeTypeOf('string')
    const again = argon2Sync('argon2id', { message: '拿鐵 110 元', nonce: Buffer.from(salt, 'base64'), tagLength: 32, memory: 19456, passes: 2, parallelism: 1 })
    expect(b64(again), '用同一組 salt 與參數重算結果不同：要用 argon2(\'argon2id\', …)，不是 scrypt 或 SHA-256').toBe(hash)
  })

  it('同一個密碼雜湊兩次結果不同（每次新的隨機 salt）', async () => {
    const a = await svc.hash('same-password'), b = await svc.hash('same-password')
    expect(a, '兩次雜湊一樣：salt 要用 randomBytes(16) 每次重新產生').not.toBe(b)
  })

  it('verify：正確密碼 true、錯誤密碼 false', async () => {
    const stored = await svc.hash('latte-110-please')
    expect(await svc.verify('latte-110-please', stored), '正確的密碼要回 true').toBe(true)
    expect(await svc.verify('latte-110-pleasE', stored), '錯誤的密碼要回 false').toBe(false)
  })

  it('verify 依字串裡的參數重算：舊的 t=1 雜湊仍能驗證，而且 needsRehash 為 true', async () => {
    const old = make('espresso', 1)
    expect(await svc.verify('espresso', old), 't=1 的舊雜湊驗證失敗：verify 要用字串裡的 m、t、p，不是目前的設定').toBe(true)
    expect(svc.needsRehash(old), '參數跟目前設定不同時 needsRehash 要回 true').toBe(true)
    expect(svc.needsRehash(make('espresso', 2)), '參數跟目前設定相同時 needsRehash 要回 false').toBe(false)
    expect(svc.needsRehash('$2b$10$abcdefghijklmnopqrstuu'), '不是 argon2id（例如舊的 bcrypt）要回 true').toBe(true)
  })

  it('格式錯誤、長度不同的雜湊回 false，不丟錯', async () => {
    const good = make('mocha', 2)
    const cases = ['', 'mocha', '$argon2id$v=19$m=19456,t=2,p=1$', good.slice(0, -4), good.replace('$argon2id$', '$argon2i$'), good + 'AAAA']
    for (const stored of cases) {
      await expect(svc.verify('mocha', stored), `verify('mocha', '${stored.slice(0, 40)}…') 要回 false（長度不同時 timingSafeEqual 會丟錯，要先比長度）`).resolves.toBe(false)
    }
  })

  it('比對雜湊用 crypto.timingSafeEqual：正確密碼它回 true、錯誤密碼它回 false', async () => {
    const stored = make('flat-white', 2)
    const msg = '比對兩個雜湊要用 crypto.timingSafeEqual(重算的結果, 字串裡的雜湊)，而且 verify 的結果就是它的結果：=== 或 Buffer.equals 會在第一個不同的位元組提早結束'
    tse.spy.mockClear()
    expect(await svc.verify('flat-white', stored), '正確的密碼要回 true').toBe(true)
    expect(tse.spy.mock.results.map((r: any) => r.value), msg).toContain(true)
    tse.spy.mockClear()
    expect(await svc.verify('flat-whitE', stored), '錯誤的密碼要回 false').toBe(false)
    expect(tse.spy.mock.results.map((r: any) => r.value), msg).toEqual([false])
  })
})
