// 練習 2：magic link 登入：只給已註冊的人、拿到的是寄給自己的那封信
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import { createUser, deleteUsers, requireStack, slugOf, sql, stack, type TestUser } from '../../helpers/supa.ts'
import { configFor } from './harness.ts'
import { magicLogin } from './magic.ts'

const dir = import.meta.dirname
let a: TestUser, b: TestUser
before(async () => {
  requireStack(['db', 'kong', 'auth', 'inbucket'])
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
})
after(() => deleteUsers(dir))

const mails = async (email: string) => (await (await fetch(`${stack().MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()).messages as { ID: string }[]

// 夾在學習者與 Mailpit 之間：A 的登入信寄出之後，下一次查詢前先寄一封登入信給另一位顧客 B、等它進了 Mailpit 再轉送。
// 這樣 Mailpit 裡「最新的一封」一定是 B 的，不看收件人的寫法會被抓到
async function mailpitWithDecoy() {
  const baseline = (await mails(a.email)).length
  let fired: Promise<void> | undefined
  const decoy = async () => {
    const before = (await mails(b.email)).length
    await createClient(stack().API_URL, stack().PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithOtp({ email: b.email, options: { shouldCreateUser: false } })
    for (let i = 0; i < 50 && (await mails(b.email)).length === before; i++) await new Promise(r => setTimeout(r, 100))
  }
  const server = createServer(async (req, res) => {
    if (!fired && (await mails(a.email)).length > baseline) fired = decoy()
    await fired
    const r = await fetch(stack().MAILPIT_URL + req.url)
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' }).end(Buffer.from(await r.arrayBuffer()))
  })
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res))
  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, close: () => new Promise(res => server.close(res)) }
}

test('用寄給自己的登入信換到自己的 session（同時有別人的信寄到）', async () => {
  const mailpit = await mailpitWithDecoy()
  try {
    const r = await magicLogin({ ...configFor('public'), mailpitUrl: mailpit.url }, a.email)
    assert.notEqual(r.userId, b.id, '登入成了另一位顧客 B：找信時要用收件人篩選（search?query=to:"…"），不能直接拿最新的一封')
    assert.equal(r.userId, a.id, '回傳的 userId 要是這個 email 的使用者')
    const role = JSON.parse(Buffer.from(r.accessToken.split('.')[1], 'base64url').toString()).role
    assert.equal(role, 'authenticated', 'accessToken 是 verifyOtp 拿到的 session.access_token')
  } finally {
    await mailpit.close()
  }
})

test('連續登入兩次都成功：每次用的是這次寄出的信', async () => {
  const cfg = configFor('public')
  const pause = () => new Promise(r => setTimeout(r, 1100))   // 同一個 email 每秒最多寄一封（[auth.email] max_frequency）
  await pause()
  assert.equal((await magicLogin(cfg, a.email)).userId, a.id)
  await pause()
  assert.equal((await magicLogin(cfg, a.email)).userId, a.id,
    '第二次登入失敗：Mailpit 裡還有上一封（連結已經用過）。要等這次寄出的信（Created 在寄出之後），信還沒到就每 200ms 再查一次')
})

test('沒註冊過的 email：丟出錯誤，不會順手建立帳號', async () => {
  const email = `${slugOf(dir)}-nobody@learn.test`
  await sql('delete from auth.users where email = $1', [email])
  await assert.rejects(magicLogin(configFor('public'), email), '沒註冊過的 email 要丟出錯誤（signInWithOtp 加 shouldCreateUser: false，Auth 會回 otp_disabled）')
  const [{ n }] = await sql('select count(*)::int as n from auth.users where email = $1', [email])
  assert.equal(n, 0, 'signInWithOtp 預設會替沒見過的 email 建立帳號：登入頁打錯字就多一個帳號。要加 options.shouldCreateUser: false')
})
