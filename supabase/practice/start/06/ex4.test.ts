// 練習 4：profiles trigger：從 API 註冊，profiles 自動多一列
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, clientFor, deleteUsers, dropTaskSchema, requireStack, slugOf, sql, stack, taskSchema } from '../../helpers/supa.ts'
import { localize } from './harness.ts'

const dir = import.meta.dirname
let schema: string
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  schema = await taskSchema(dir)
  await deleteUsers(dir)
  await applySql(schema, localize(readFileSync(join(dir, 'profiles.sql'), 'utf8'), dir, schema))
})
after(async () => {
  if (schema) await dropTaskSchema(schema)   // 函式刪掉時，掛在 auth.users 上的 trigger 也一起刪
  await deleteUsers(dir)
})

const signUp = (name: string, data?: object) => createClient(stack().API_URL, stack().PUBLISHABLE_KEY, { auth: { persistSession: false } })
  .auth.signUp({ email: `${slugOf(dir)}-${name}@learn.test`, password: `pw-${name}-123456`, options: data ? { data } : {} })

test('從 API 註冊成功，profiles 多一列，display_name 是註冊時填的', async () => {
  const { data, error } = await signUp('new', { display_name: '王小明' })
  assert.equal(error, null,
    `註冊失敗：${error?.message}。trigger 出錯會讓整個註冊失敗（Database error saving new user）：執行 trigger 的是 Auth 服務的角色，它沒有 profiles 的權限，函式要 security definer`)
  const rows = await sql(`select id, display_name from ${schema}.profiles`)
  assert.deepEqual(rows, [{ id: data.user!.id, display_name: '王小明' }], 'display_name 從 new.raw_user_meta_data ->> \'display_name\' 取（signUp 的 options.data 存在那裡）')
})

test('沒填 display_name 的人也註冊得了，display_name 是空字串', async () => {
  const { data, error } = await signUp('plain')
  assert.equal(error, null, `註冊失敗：${error?.message}`)
  const [row] = await sql(`select display_name from ${schema}.profiles where id = $1`, [data.user!.id])
  assert.deepEqual(row, { display_name: '' }, 'raw_user_meta_data 裡沒有 display_name 時用 coalesce 補空字串（欄位是 not null）')
})

test('登入的人從 API 只讀到自己的 profile', async () => {
  const { data } = await signUp('reader', { display_name: '陳美華' })
  assert.ok(data.session, '註冊後應該直接拿到 session（本機沒開信箱驗證）')
  const me = clientFor(schema, { accessToken: data.session.access_token } as any)
  const { data: rows, error } = await me.from('profiles').select('display_name')
  assert.equal(error, null, `讀 profiles 失敗：${error?.message}（要 GRANT select 給 authenticated）`)
  assert.deepEqual(rows, [{ display_name: '陳美華' }], '只看得到自己那一列：policy 用 id = (select auth.uid())')
})

test('security definer 函式鎖住 search_path', async () => {
  const fns = await sql(`select proname, prosecdef, proconfig from pg_proc where pronamespace = $1::regnamespace and prorettype = 'trigger'::regtype`, [schema])
  assert.equal(fns.length, 1, 'profiles.sql 裡要有一個 returns trigger 的函式')
  assert.ok(fns[0].prosecdef, '函式要 security definer')
  assert.ok((fns[0].proconfig ?? []).some((c: string) => /^search_path=("")?$/.test(c)),
    'security definer 函式以擁有者的權限執行，要加 set search_path = \'\'，不然呼叫的人可以先在自己的 schema 放同名的表或函式，讓它執行到別的東西')
})
