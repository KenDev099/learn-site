// 練習 3：店員列出顧客的收據，一次產生所有下載網址
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, recordingProxy, requireStack, taskSchema, type TestUser } from '../../helpers/supa.ts'
import { bucketOf, dropStorage, localize, png } from './harness.ts'
import { receiptLinks } from './staff.ts'

const dir = import.meta.dirname
const bucket = bucketOf(dir)
let schema: string, a: TestUser, b: TestUser, staff: TestUser
let proxy: Awaited<ReturnType<typeof recordingProxy>>
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth', 'storage'])
  await dropStorage(dir)
  schema = await taskSchema(dir)
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
  staff = await createUser(dir, 'staff', { app_metadata: { role: 'staff' } })
  await applySql(schema, localize(`
    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);
    create policy "收據：自己的資料夾" on storage.objects for all to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "收據：店員讀全部" on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'staff');`, dir, schema))
  for (const n of [12, 3, 7]) {
    const { error } = await clientFor(schema, a).storage.from(bucket).upload(`${a.id}/${n}.png`, png(n), { contentType: 'image/png' })
    assert.equal(error, null, '準備測試用的收據失敗')
  }
  proxy = await recordingProxy()
})
after(async () => {
  await proxy?.close()
  await dropStorage(dir)
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

test('店員拿到顧客 A 的三張收據，依檔名排序，每個網址都下載得到', async () => {
  const links = await receiptLinks(clientFor(schema, staff), bucket, a.id)
  assert.deepEqual(links.map(l => l.name), ['12.png', '3.png', '7.png'], 'name 是檔名（不含資料夾），依檔名排序（字串排序，12 在 3 前面）')
  for (const [i, n] of [12, 3, 7].entries()) {
    const res = await fetch(links[i].url)
    assert.equal(res.status, 200, `${links[i].name} 的網址下載失敗（${res.status}）：bucket 不公開，要用 signed URL`)
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), png(n), `${links[i].name} 的內容不對：網址要對應到同一個檔案`)
    const token = new URL(links[i].url).searchParams.get('token')!
    const { iat, exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    assert.equal(exp - iat, 300, '網址有效 300 秒')
  }
})

test('只發兩個 Storage 請求：列檔案一次、產生網址一次', async () => {
  proxy.requests.length = 0
  await receiptLinks(clientFor(schema, staff, proxy.url), bucket, a.id)
  const paths = proxy.requests.map(r => `${r.method} ${r.path}`)
  assert.equal(paths.length, 2, `發了 ${paths.length} 個請求（${paths.join('、')}）：用 createSignedUrls 一次替所有檔案產生網址，不要每個檔案各發一個請求`)
})

test('別的顧客用同一個函式查 A：拿到空陣列（RLS 也管 list）', async () => {
  assert.deepEqual(await receiptLinks(clientFor(schema, b), bucket, a.id), [], '顧客 B 列 A 的資料夾應該什麼都看不到；沒有檔案時直接回傳 []')
})
