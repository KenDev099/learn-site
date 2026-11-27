// 第 4 課的測試資料（不用改）：在這一題專屬的 schema 建 orders 表，資料屬於兩個真的使用者 A、B。
// 表一開始沒開 RLS、也沒有任何 GRANT：兩道門都由你的 SQL 打開
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, createUser, sql, taskSchema, type TestUser } from '../../helpers/supa.ts'

export type Cafe = { schema: string, a: TestUser, b: TestUser, orderOf: { a: number[], b: number[] } }

export async function cafe(dir: string, ex: string, setup = ''): Promise<Cafe> {
  const schema = await taskSchema(dir)
  const a = await createUser(dir, `${ex}_a`)
  const b = await createUser(dir, `${ex}_b`)
  await applySql(schema, `create table orders (
    id integer generated always as identity primary key,
    customer_id uuid not null,
    total integer not null,
    note text,
    ordered_at timestamptz not null default now()
  );`)
  const ids = await sql<{ id: number }>(`insert into ${schema}.orders (customer_id, total, note) values
    ($1, 190, '少冰'), ($1, 150, null), ($2, 220, '外帶') returning id`, [a.id, b.id])
  if (setup) await applySql(schema, setup)
  await applySql(schema, readFileSync(join(dir, `${ex}.sql`), 'utf8'))
  return { schema, a, b, orderOf: { a: [ids[0].id, ids[1].id], b: [ids[2].id] } }
}
