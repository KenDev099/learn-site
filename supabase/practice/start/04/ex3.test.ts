// 練習 3：作者可以改自己的評論，不能改別人的，也不能冒名（把 author_id 改成別人）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, sql, taskSchema, type TestUser } from '../../helpers/supa.ts'

const dir = import.meta.dirname
let schema: string, a: TestUser, b: TestUser
let ofA: number[], ofB: number
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  schema = await taskSchema(dir)
  a = await createUser(dir, 'ex3_a')
  b = await createUser(dir, 'ex3_b')
  await applySql(schema, `create table reviews (
    id integer generated always as identity primary key,
    product_id integer not null,
    author_id uuid not null,
    rating integer not null check (rating between 1 and 5),
    body text not null
  );
  alter table reviews enable row level security;`)
  const ids = await sql<{ id: number }>(`insert into ${schema}.reviews (product_id, author_id, rating, body) values
    (2, $1, 4, '拿鐵很順'), (6, $1, 2, '起司蛋糕偏甜'), (2, $2, 5, '每天都喝') returning id`, [a.id, b.id])
  ofA = [ids[0].id, ids[1].id]
  ofB = ids[2].id
  await applySql(schema, readFileSync(join(dir, 'ex3.sql'), 'utf8'))
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const row = async (id: number) => (await sql(`select author_id, rating, body from ${schema}.reviews where id = $1`, [id]))[0]

test('任何人（含沒登入）都讀得到全部 3 則評論', async () => {
  for (const [who, client] of [['沒登入', clientFor(schema)], ['A', clientFor(schema, a)]] as const) {
    const r = await client.from('reviews').select('id')
    assert.equal(r.data?.length, 3, `${who}讀到 ${r.data?.length ?? r.error?.message}：評論要對 anon、authenticated 都公開（select policy＋grant select）`)
  }
})

test('A 改得了自己的評論', async () => {
  const r = await clientFor(schema, a).from('reviews').update({ rating: 3, body: '起司蛋糕改配方後不錯' }).eq('id', ofA[1]).select('id')
  assert.equal(r.error?.message, undefined, `A 改自己的評論失敗：${r.error?.message}（42501 permission denied 代表少了 update 的 GRANT）`)
  assert.deepEqual(await row(ofA[1]), { author_id: a.id, rating: 3, body: '起司蛋糕改配方後不錯' },
    `資料庫裡沒變（API 回了 ${JSON.stringify(r.data)}）：update 要先「看得到」那一列，沒有 select policy 時會默默改了 0 列`)
})

test('A 改不到 B 的評論（0 列，資料庫不變）', async () => {
  const r = await clientFor(schema, a).from('reviews').update({ rating: 1 }).eq('id', ofB).select('id')
  assert.deepEqual(r.data ?? [], [], 'A 改 B 的評論應該改到 0 列：update policy 的 USING 要有作者條件')
  assert.equal((await row(ofB)).rating, 5, 'B 的評分不能被 A 改掉')
})

test('A 不能把自己的評論改成 B 寫的（冒名）', async () => {
  const r = await clientFor(schema, a).from('reviews').update({ author_id: b.id }).eq('id', ofA[0])
  assert.ok(r.error, '把 author_id 改成 B 應該被拒絕：WITH CHECK 檢查改完之後的新列，要寫成 author_id = (select auth.uid())，不能是 true')
  assert.equal((await row(ofA[0])).author_id, a.id, '評論的作者還是 A')
})
