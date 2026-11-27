// 練習 2：上傳收據（可以重傳）並產生 60 秒的 signed URL
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, sql, taskSchema, type TestUser } from '../../helpers/supa.ts'
import { bucketOf, dropStorage, localize, png } from './harness.ts'
import { uploadReceipt } from './upload.ts'

const dir = import.meta.dirname
const bucket = bucketOf(dir)
let schema: string, a: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth', 'storage'])
  await dropStorage(dir)
  schema = await taskSchema(dir)
  a = await createUser(dir, 'a')
  // 這一題用最精簡的設定：不公開的 bucket，顧客對自己資料夾的檔案什麼都能做
  await applySql(schema, localize(`
    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);
    create policy "收據：自己的資料夾" on storage.objects for all to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);`, dir, schema))
})
after(async () => {
  await dropStorage(dir)
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

test('上傳到 <userId>/<orderId>.png，回傳的網址下載得到同一個檔案', async () => {
  const url = await uploadReceipt(clientFor(schema, a), bucket, a.id, 7, png(32))
  assert.ok(url.startsWith('http'), `要回傳下載網址，實際是 ${JSON.stringify(url)}`)
  const [row] = await sql(`select name, metadata ->> 'mimetype' as type from storage.objects where bucket_id = $1`, [bucket])
  assert.deepEqual(row, { name: `${a.id}/7.png`, type: 'image/png' }, '路徑是 <userId>/<orderId>.png，contentType 是 image/png')
  const res = await fetch(url)
  assert.equal(res.status, 200, `用回傳的網址下載失敗（${res.status}）：bucket 不公開，public URL 下載不到，要用 createSignedUrl`)
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), png(32), '下載到的內容要跟上傳的一樣')
})

test('網址 60 秒後過期', async () => {
  const url = await uploadReceipt(clientFor(schema, a), bucket, a.id, 8, png())
  const token = new URL(url).searchParams.get('token')
  assert.ok(token, '回傳的要是 signed URL（網址裡有 token 參數）')
  const { iat, exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  assert.equal(exp - iat, 60, `有效期要是 60 秒，實際是 ${exp - iat} 秒：createSignedUrl 的第二個參數是秒數`)
})

test('同一張訂單重傳收據：覆蓋舊檔', async () => {
  await uploadReceipt(clientFor(schema, a), bucket, a.id, 9, png(8))
  const url = await uploadReceipt(clientFor(schema, a), bucket, a.id, 9, png(40))
  assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), png(40), '重傳後下載到的要是新的檔案：upload 加 upsert: true')
})

test('上傳失敗時丟出 Error', async () => {
  await assert.rejects(uploadReceipt(clientFor(schema), bucket, a.id, 10, png()), '沒登入（anon）上傳會被 policy 擋下：supabase-js 不丟例外，要檢查 error 並 throw')
})
