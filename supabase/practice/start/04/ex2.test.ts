// 練習 2：擁有者可以新增，不能替別人下單
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { clientFor, deleteUsers, dropTaskSchema, requireStack, sql } from '../../helpers/supa.ts'
import { cafe, type Cafe } from './cafe.ts'

const dir = import.meta.dirname
let c: Cafe
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  c = await cafe(dir, 'ex2', `alter table orders enable row level security;
    create policy "顧客讀自己的訂單" on orders for select to authenticated using (customer_id = (select auth.uid()));
    grant select on orders to authenticated;`)
})
after(async () => {
  if (c) await dropTaskSchema(c.schema)
  await deleteUsers(dir)
})

const count = async () => (await sql(`select count(*)::int as n from ${c.schema}.orders`))[0].n

test('A 能新增自己的訂單，並拿回新的那一列', async () => {
  const r = await clientFor(c.schema, c.a).from('orders').insert({ customer_id: c.a.id, total: 80 }).select('id, customer_id').single()
  assert.equal(r.error?.message, undefined, `A 新增自己的訂單失敗：${r.error?.message}（42501 permission denied 是沒有 GRANT；new row violates … 是 policy 沒放行）`)
  assert.equal(r.data?.customer_id, c.a.id)
})

test('A 不能替 B 下單：回 42501，資料庫沒有多出訂單', async () => {
  const before = await count()
  const r = await clientFor(c.schema, c.a).from('orders').insert({ customer_id: c.b.id, total: 1 })
  assert.equal(r.error?.code, '42501', `A 寫 customer_id = B 應該被 WITH CHECK 擋下（42501 new row violates row-level security policy），實際：${r.error?.message ?? '成功了'}`)
  assert.equal(await count(), before, '被擋下時不能寫進任何一列')
})

test('沒登入不能新增', async () => {
  const r = await clientFor(c.schema).from('orders').insert({ customer_id: c.a.id, total: 1 })
  assert.equal(r.error?.code, '42501', 'anon 新增訂單應該被拒絕：insert 只 grant 給 authenticated')
})
