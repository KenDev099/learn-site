// 練習 1：擁有者才讀得到自己的訂單。測試用兩個真使用者的 JWT 透過 API 讀
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { clientFor, deleteUsers, dropTaskSchema, requireStack, sql } from '../../helpers/supa.ts'
import { cafe, type Cafe } from './cafe.ts'

const dir = import.meta.dirname
let c: Cafe
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  c = await cafe(dir, 'ex1')
})
after(async () => {
  if (c) await dropTaskSchema(c.schema)
  await deleteUsers(dir)
})

const ids = (rows: { id: number }[] | null) => (rows ?? []).map(r => r.id).sort((x, y) => x - y)

test('A 只讀到自己的 2 張訂單，B 只讀到自己的 1 張', async () => {
  const a = await clientFor(c.schema, c.a).from('orders').select('id')
  assert.equal(a.error?.message, undefined, `A 讀訂單失敗：${a.error?.message}（42501 代表沒有 grant select on orders to authenticated）`)
  assert.deepEqual(ids(a.data), c.orderOf.a, `A 讀到 ${JSON.stringify(ids(a.data))}，應該只有自己的 ${JSON.stringify(c.orderOf.a)}：policy 要比對 customer_id 與 auth.uid()，using (true) 會讓每個人看到全部`)
  const b = await clientFor(c.schema, c.b).from('orders').select('id')
  assert.deepEqual(ids(b.data), c.orderOf.b, `B 讀到 ${JSON.stringify(ids(b.data))}，應該只有自己的 ${JSON.stringify(c.orderOf.b)}`)
})

test('A 改網址的 id 也讀不到 B 的訂單（IDOR）', async () => {
  const r = await clientFor(c.schema, c.a).from('orders').select('id, total').eq('id', c.orderOf.b[0]).maybeSingle()
  assert.equal(r.data, null, 'A 用 B 的訂單 id 查詢要查不到（RLS 讓那一列對 A 不存在）')
})

test('沒登入的人一張都讀不到', async () => {
  const r = await clientFor(c.schema).from('orders').select('id')
  assert.ok(r.error || r.data?.length === 0, `anon 讀到了 ${r.data?.length} 張訂單：policy 要寫 to authenticated，GRANT 也不要給 anon`)
})

test('policy 只給 authenticated，auth.uid() 包在 (select …) 裡', async () => {
  const policies = await sql(`select policyname, roles::text[] as roles, qual from pg_policies where schemaname = $1 and tablename = 'orders' and cmd in ('SELECT', 'ALL')`, [c.schema])
  assert.ok(policies.length, '沒有 select 的 policy')
  for (const p of policies) {
    assert.deepEqual(p.roles, ['authenticated'], `policy「${p.policyname}」的對象是 ${p.roles}：寫 to authenticated（不寫時是 public，連 anon 都套用）`)
    assert.match(p.qual ?? '', /\(\s*SELECT auth\.uid\(\)/i, `policy「${p.policyname}」的條件是 ${p.qual}：寫成 customer_id = (select auth.uid())，Postgres 才會整個查詢只算一次，不是每一列算一次`)
  }
})

test('customer_id 有索引', async () => {
  const rows = await sql(`select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = $1::regclass and a.attname = 'customer_id'`, [`${c.schema}.orders`])
  assert.equal(rows.length > 0, true, 'policy 等於在每個查詢加上 where customer_id = …：customer_id 要有索引（第一個欄位是 customer_id），訂單多了才不會整張表掃一遍')
})
