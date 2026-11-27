// 練習 2：店長角色放在 app_metadata（只有伺服器改得到），不是 user_metadata（使用者自己改得到）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, stack, type TestUser } from '../../helpers/supa.ts'
import { applyYours, schemas } from './cafe.ts'

const dir = import.meta.dirname
let schema: string, priv: string
let manager: TestUser, fake: TestUser, staff: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  ;({ schema, priv } = await schemas(dir))
  manager = await createUser(dir, 'ex2_manager', { app_metadata: { role: 'manager' } })
  fake = await createUser(dir, 'ex2_fake', { user_metadata: { role: 'manager' } })
  staff = await createUser(dir, 'ex2_staff')
  await applySql(schema, 'alter table orders enable row level security; grant select on orders to authenticated;')
  await applyYours(dir, 'ex2.sql', schema, priv)
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

test('app_metadata 是 manager 的店長看得到 4 張訂單', async () => {
  const r = await clientFor(schema, manager).from('orders').select('id')
  assert.equal(r.data?.length, 4, `店長看到 ${r.data?.length ?? r.error?.message} 張：用 auth.jwt() -> 'app_metadata' ->> 'role' 判斷。JWT 最外層的 role 是資料庫角色 authenticated，不是店長`)
})

test('user_metadata 寫著 manager 的人看不到', async () => {
  const r = await clientFor(schema, fake).from('orders').select('id')
  assert.deepEqual(r.data ?? [], [], 'user_metadata 是使用者註冊時自己填的：用它判斷角色，誰都能當店長')
})

test('一般使用者用 updateUser 把自己改成 manager，重新拿 token 後仍然看不到', async () => {
  const { API_URL, PUBLISHABLE_KEY } = stack()
  const client = createClient(API_URL, PUBLISHABLE_KEY, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } })
  await client.auth.setSession({ access_token: staff.accessToken, refresh_token: staff.refreshToken })
  const up = await client.auth.updateUser({ data: { role: 'manager' } })
  assert.equal(up.error, null, `（測試）updateUser 失敗：${up.error?.message}`)
  const refreshed = await client.auth.refreshSession()
  assert.equal(refreshed.data.user?.user_metadata.role, 'manager', '（測試）新的 token 裡 user_metadata.role 已經是 manager')
  const r = await client.from('orders').select('id')
  assert.deepEqual(r.data ?? [], [], '使用者自己改了 user_metadata 就看到全部訂單：角色要放 app_metadata（只有 secret key 的 admin API 改得到）')
})

test('policy 只給 authenticated', async () => {
  const r = await clientFor(schema).from('orders').select('id')
  assert.ok(r.error || r.data?.length === 0, 'anon 看得到訂單')
})
