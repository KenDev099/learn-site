// 練習 3：報表 view 要 security_invoker，否則以建立者身分繞過 RLS
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, sql, type TestUser } from '../../helpers/supa.ts'
import { applyYours, schemas } from './cafe.ts'

const dir = import.meta.dirname
let schema: string, priv: string
let s1: TestUser, s2: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  ;({ schema, priv } = await schemas(dir))
  s1 = await createUser(dir, 'ex3_s1', { app_metadata: { store_id: 1 } })
  s2 = await createUser(dir, 'ex3_s2', { app_metadata: { store_id: 2 } })
  await applySql(schema, `alter table orders enable row level security;
    create policy "店員看自己分店" on orders for select to authenticated
      using (store_id = ((select auth.jwt()) -> 'app_metadata' ->> 'store_id')::integer);
    grant select on orders to authenticated;`)
  await applyYours(dir, 'ex3.sql', schema, priv)
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

test('店員查報表只看到自己分店那一列', async () => {
  for (const [who, user, want] of [['台北店', s1, { store_id: 1, order_count: 2, revenue: 300 }], ['台中店', s2, { store_id: 2, order_count: 1, revenue: 220 }]] as const) {
    const r = await clientFor(schema, user).from('store_report').select('store_id, order_count, revenue')
    assert.equal(r.error?.message, undefined, `${who}的店員查 store_report 失敗：${r.error?.message}`)
    assert.deepEqual(r.data, [want], `${who}的店員應該只看到自己分店：${JSON.stringify(r.data)}。view 預設以建立者（postgres）的身分讀 orders，RLS 不會套用；加 with (security_invoker = true)`)
  }
})

test('沒登入不能查報表', async () => {
  const [{ ok }] = await sql(`select has_table_privilege('anon', $1, 'select') as ok`, [`${schema}.store_report`])
  assert.equal(ok, false, 'anon 有 store_report 的 select 權限：報表只 grant 給 authenticated')
})

test('view 設了 security_invoker', async () => {
  const [v] = await sql(`select reloptions from pg_class where oid = $1::regclass`, [`${schema}.store_report`])
  assert.ok((v?.reloptions ?? []).some((o: string) => /^security_invoker=(true|on|1)$/i.test(o)), 'store_report 要 with (security_invoker = true)')
})
