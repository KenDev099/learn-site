// helpers/supa.ts 的自我檢查（改了 helper 之後執行）：node supabase/practice/bin/selfcheck.ts
// 建一個判分用 schema、套 SQL、從 API 讀到、不存在的 schema 被拒絕、刪掉之後 PostgREST 的清單也跟著拿掉
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { PRACTICE, applySql, clientFor, createUser, deleteUsers, dropTaskSchema, privateSchema, slugOf, sql, stack, taskSchema } from '../helpers/supa.ts'

assert.equal(slugOf(join(PRACTICE, 'work', '04')), 'w04')
assert.equal(slugOf(join(PRACTICE, 'verify', '04-123-wrong-ex1-secret')), 'v04_123_wrong_ex1_secret')

const { API_URL, PUBLISHABLE_KEY } = stack()
const dir = join(PRACTICE, 'verify', '00-0-selfcheck')
const schema = await taskSchema(dir)
try {
  await applySql(schema, `create table notes (id int primary key); insert into notes values (1);
    alter table notes enable row level security;
    create policy "anon 可讀" on notes for select to anon using (true);
    grant select on notes to anon;`)
  const get = (profile: string) => fetch(`${API_URL}/rest/v1/notes`, { headers: { apikey: PUBLISHABLE_KEY, 'Accept-Profile': profile } })
  assert.deepEqual(await (await get(schema)).json(), [{ id: 1 }], '從自己的 schema 讀得到')
  assert.equal((await get('t_does_not_exist')).status, 406, '不在清單裡的 schema 回 406 PGRST106')

  // createUser／clientFor：兩個真使用者各自只看得到自己的列，anon 看不到
  const a = await createUser(dir, 'a', { app_metadata: { role: 'staff' } })
  const b = await createUser(dir, 'b')
  assert.equal(a.email, 'v00_0_selfcheck-a@learn.test')
  assert.equal((await createUser(dir, 'b')).email, b.email, '同名再建一次不會失敗（先刪舊的）')
  await applySql(schema, `create table mine (owner uuid primary key default auth.uid(), note text);
    alter table mine enable row level security;
    create policy "自己的" on mine for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
    grant select, insert on mine to authenticated;`)
  const ca = clientFor(schema, a)
  assert.equal((await ca.from('mine').insert({ note: 'A' })).error, null, 'A 新增自己的列')
  assert.deepEqual((await ca.from('mine').select('owner, note')).data, [{ owner: a.id, note: 'A' }])
  const cb = await createUser(dir, 'b').then(u => clientFor(schema, u))
  assert.deepEqual((await cb.from('mine').select('note')).data, [], 'B 看不到 A 的列')
  assert.equal((await clientFor(schema).from('mine').select('note')).error?.code, '42501', 'anon 沒有 GRANT')
  const priv = await privateSchema(dir)
  assert.equal(priv, 'p_v00_0_selfcheck')
  await applySql(schema, `create function ${priv}.hidden() returns int language sql as 'select 1'; grant usage on schema ${priv} to anon; grant execute on function ${priv}.hidden() to anon;`)
  assert.equal((await clientFor(priv).rpc('hidden')).error?.code, 'PGRST106', 'private schema 不在 PostgREST 的清單裡，API 叫不到')
  const [{ claims }] = await sql(`select raw_app_meta_data as claims from auth.users where id = $1`, [a.id])
  assert.equal(claims.role, 'staff', 'app_metadata 有寫進去')
} finally {
  await dropTaskSchema(schema)
  await deleteUsers(dir)
}
assert.equal((await sql(`select count(*)::int as n from pg_namespace where nspname = 'p_v00_0_selfcheck'`))[0].n, 0, 'dropTaskSchema 也刪掉 p_ schema')
assert.equal((await sql(`select count(*)::int as n from auth.users where email like 'v00\\_0\\_selfcheck-%'`))[0].n, 0, 'deleteUsers 刪掉這一題的使用者')
const [{ rolconfig }] = await sql(`select rolconfig from pg_roles where rolname = 'authenticator'`)
assert(!rolconfig.some((c: string) => c.includes(schema)), '刪掉之後 pgrst.db_schemas 不再有它')
const menu = await fetch(`${API_URL}/rest/v1/products?select=name&limit=1`, { headers: { apikey: PUBLISHABLE_KEY } })
assert.equal(menu.status, 200, '沒帶 Accept-Profile 時預設 schema 要是 public（pgrst.db_schemas 第一個）')
console.log('✓ helpers/supa.ts 自我檢查通過')
