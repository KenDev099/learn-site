// 練習 3：伺服器端用 cookie 裡的 session 判斷身分，要驗簽章
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { createUser, deleteUsers, requireStack, stack, type TestUser } from '../../helpers/supa.ts'
import { configFor } from './harness.ts'
import { handleMe } from './server.ts'

const dir = import.meta.dirname
let a: TestUser, b: TestUser, cookie: { name: string, value: string }
before(async () => {
  requireStack(['db', 'kong', 'auth'])
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
  // 跟瀏覽器一樣用 @supabase/ssr 登入，收下它要寫進 cookie 的 session
  const jar: { name: string, value: string }[] = []
  const browser = createServerClient(stack().API_URL, stack().PUBLISHABLE_KEY, { cookies: { getAll: () => [], setAll: list => { jar.push(...list) } } })
  const { error } = await browser.auth.signInWithPassword({ email: a.email, password: a.password })
  assert.equal(error, null, '測試用的使用者登入失敗')
  assert.equal(jar.length, 1, 'session 應該存成一個 cookie')
  cookie = jar[0]
})
after(() => deleteUsers(dir))

const get = (cookieHeader?: string) => handleMe(new Request('http://localhost/api/me', { headers: cookieHeader ? { cookie: cookieHeader } : {} }), configFor('public'))

test('帶著登入後的 cookie：回 200 與自己的 id、email', async () => {
  const res = await get(`theme=dark; ${cookie.name}=${cookie.value}`)
  assert.equal(res.status, 200, `已登入的請求要回 200，實際是 ${res.status}：${await res.clone().text()}`)
  assert.deepEqual(await res.json(), { userId: a.id, email: a.email })
})

test('沒有 cookie：回 401', async () => {
  const res = await get()
  assert.equal(res.status, 401, '沒登入（沒有 session）要回 401，不是 200 加上空的 userId')
})

test('竄改過的 cookie：回 401', async () => {
  // 攻擊者把 cookie 裡的 session 改成顧客 B：access token 的 payload 換掉（簽章沒辦法重算）、user 物件也換掉
  const session = JSON.parse(Buffer.from(cookie.value.replace(/^base64-/, ''), 'base64url').toString())
  const [header, payload, signature] = session.access_token.split('.')
  const claims = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: b.id, email: b.email }
  session.access_token = [header, Buffer.from(JSON.stringify(claims)).toString('base64url'), signature].join('.')
  session.user = { ...session.user, id: b.id, email: b.email }
  const forged = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const res = await get(`${cookie.name}=${forged}`)
  assert.equal(res.status, 401,
    `竄改過的 cookie 被當成顧客 B（${res.status} ${await res.clone().text()}）：getSession() 只是把 cookie 的內容讀出來，沒有驗簽章。伺服器端判斷身分要用 getClaims()（或 getUser()）`)
})
