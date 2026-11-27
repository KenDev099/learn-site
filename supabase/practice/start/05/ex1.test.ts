// 練習 1：多租戶（分店）＋security definer 函式。店員用真的 JWT 透過 API 讀
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, sql, type TestUser } from '../../helpers/supa.ts'
import { applyYours, ordersOf, schemas } from './cafe.ts'

const dir = import.meta.dirname
let schema: string, priv: string
let s1: TestUser, s1b: TestUser, s2: TestUser, out: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  ;({ schema, priv } = await schemas(dir))
  ;[s1, s1b, s2, out] = await Promise.all(['ex1_s1', 'ex1_s1b', 'ex1_s2', 'ex1_out'].map(n => createUser(dir, n)))
  await applyYours(dir, 'ex1.sql', schema, priv)
  await sql(`insert into ${schema}.store_members (store_id, user_id) values (1, $1), (1, $2), (2, $3)`, [s1.id, s1b.id, s2.id])
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const ids = (rows: { id: number }[] | null) => (rows ?? []).map(r => r.id).sort((a, b) => a - b)

test('店員只看得到自己分店的訂單', async () => {
  for (const [who, user, store] of [['台北店的店員', s1, 1], ['台中店的店員', s2, 2]] as const) {
    const r = await clientFor(schema, user).from('orders').select('id')
    assert.equal(r.error?.message, undefined, `${who}讀訂單失敗：${r.error?.message}${r.error?.code === '42P17' ? '（42P17：policy 查 store_members，store_members 的 policy 又查自己，無限遞迴。把「我屬於哪些分店」包成 security definer 函式）' : ''}`)
    assert.deepEqual(ids(r.data), await ordersOf(schema, store), `${who}應該只看到分店 ${store} 的訂單`)
  }
  const r = await clientFor(schema, out).from('orders').select('id')
  assert.deepEqual(r.data ?? [], [], '不屬於任何分店的人一張都看不到')
})

test('店員看得到同分店的同事，看不到別的分店', async () => {
  const r = await clientFor(schema, s1).from('store_members').select('user_id')
  assert.equal(r.error?.message, undefined, `讀 store_members 失敗：${r.error?.message}${r.error?.code === '42P17' ? '（42P17 無限遞迴：store_members 的 policy 不能直接查 store_members，改呼叫 private.my_store_ids()）' : ''}`)
  assert.deepEqual((r.data ?? []).map(m => m.user_id).sort(), [s1.id, s1b.id].sort(), '台北店的店員應該看到台北店的兩位成員（自己和同事），看不到台中店的')
})

test('沒登入什麼都看不到', async () => {
  for (const t of ['orders', 'store_members']) {
    const r = await clientFor(schema).from(t).select('*')
    assert.ok(r.error || r.data?.length === 0, `anon 讀得到 ${t}：只 grant select 給 authenticated`)
  }
})

test('my_store_ids 在 private schema，API 叫不到', async () => {
  const [fn] = await sql(`select n.nspname as schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'my_store_ids' and n.nspname in ($1, $2)`, [schema, priv])
  assert.ok(fn, '找不到 my_store_ids 函式：寫成 create function private.my_store_ids()')
  assert.equal(fn.schema, priv, 'my_store_ids 放在 public：public 會被 API 公開，任何人都能用 rpc() 呼叫這個繞過 RLS 的函式。放進 private schema')
  const r = await clientFor(schema).rpc('my_store_ids')
  assert.ok(r.error, 'anon 用 rpc 叫得到 my_store_ids')
})

test('my_store_ids 是 security definer、search_path 鎖成空的、只有 authenticated 能執行', async () => {
  const [fn] = await sql(`select p.prosecdef, p.proconfig, p.oid::regprocedure::text as sig from pg_proc p where p.proname = 'my_store_ids' and p.pronamespace = $1::regnamespace`, [priv])
  assert.ok(fn, 'private schema 裡沒有 my_store_ids')
  assert.equal(fn.prosecdef, true, 'my_store_ids 要是 security definer：以函式擁有者身分查 store_members，才不會再套用 store_members 的 RLS')
  assert.ok((fn.proconfig ?? []).some((c: string) => /^search_path=(""|)$/.test(c)), `security definer 函式要 set search_path = ''（現在是 ${JSON.stringify(fn.proconfig)}）：不鎖的話，呼叫的人能用自己的 search_path 讓函式裡沒寫 schema 的名稱指到別的東西`)
  const [{ anon, authed }] = await sql(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed`, [fn.sig])
  assert.equal(anon, false, 'anon 能執行 my_store_ids：函式預設 grant execute 給 public（所有角色），要 revoke execute … from public')
  assert.equal(authed, true, 'authenticated 要能執行 my_store_ids，policy 才能呼叫它')
})
