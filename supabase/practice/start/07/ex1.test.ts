// 練習 1：收據 bucket 的設定與 storage.objects 的 policy
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, stack, taskSchema, type TestUser } from '../../helpers/supa.ts'
import { bucketOf, dropStorage, localize, png } from './harness.ts'

const dir = import.meta.dirname
const bucket = bucketOf(dir)
let schema: string, a: TestUser, b: TestUser, staff: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth', 'storage'])
  await dropStorage(dir)
  schema = await taskSchema(dir)
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b', { user_metadata: { role: 'staff' } })   // 自己在 user_metadata 寫 staff 的顧客
  staff = await createUser(dir, 'staff', { app_metadata: { role: 'staff' } })
  await applySql(schema, localize(readFileSync(join(dir, 'receipts.sql'), 'utf8'), dir, schema))
})
after(async () => {
  await dropStorage(dir)
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const files = (u?: TestUser) => clientFor(schema, u).storage.from(bucket)
const upload = (u: TestUser, path: string, upsert = false) => files(u).upload(path, png(), { contentType: 'image/png', upsert })

test('顧客能上傳到自己的資料夾，也能再傳一次覆蓋（upsert）', async () => {
  const first = await upload(a, `${a.id}/1.png`)
  assert.equal(first.error, null, `上傳失敗：${first.error?.message}（要有 INSERT 的 policy：bucket_id 對、路徑第一層是自己的 id）`)
  const again = await upload(a, `${a.id}/1.png`, true)
  assert.equal(again.error, null, `覆蓋舊檔失敗：${again.error?.message}。upsert 遇到已經存在的檔案是 UPDATE，要再有 SELECT 與 UPDATE 的 policy`)
})

test('顧客讀得到自己的收據', async () => {
  await upload(a, `${a.id}/2.png`)
  const { data, error } = await files(a).download(`${a.id}/2.png`)
  assert.equal(error, null, `下載自己的收據失敗：${error?.message}（要有 SELECT 的 policy）`)
  assert.equal(data!.size, png().length)
})

test('別的顧客不能放檔案到我的資料夾，也讀不到我的收據', async () => {
  await upload(a, `${a.id}/3.png`)
  const put = await upload(b, `${a.id}/evil.png`)
  assert.ok(put.error, '顧客 B 把檔案上傳到 A 的資料夾成功了：INSERT 的 WITH CHECK 要檢查 (storage.foldername(name))[1] 是自己的 id')
  const read = await files(b).download(`${a.id}/3.png`)
  assert.ok(read.error, '顧客 B 讀到了 A 的收據：SELECT 的 policy 要檢查路徑第一層是自己的 id。B 在 user_metadata 寫了 role: staff，店員的判斷不能看 user_metadata')
})

test('店員（app_metadata.role = staff）讀得到所有收據，但不能上傳', async () => {
  await upload(a, `${a.id}/4.png`)
  const read = await files(staff).download(`${a.id}/4.png`)
  assert.equal(read.error, null, `店員讀不到顧客的收據：${read.error?.message}。用 auth.jwt() -> 'app_metadata' ->> 'role' = 'staff' 判斷`)
  const put = await upload(staff, `${a.id}/staff.png`)
  assert.ok(put.error, '店員不該能上傳到顧客的資料夾：店員的 policy 只給 SELECT')
})

test('沒登入的人拿不到收據（bucket 不公開）', async () => {
  await upload(a, `${a.id}/5.png`)
  const url = files().getPublicUrl(`${a.id}/5.png`).data.publicUrl
  assert.notEqual((await fetch(url)).status, 200, 'public URL 下載得到收據：bucket 要設成不公開（public = false），public bucket 的檔案任何人知道網址就能下載，不經過 policy')
  assert.ok((await files().download(`${a.id}/5.png`)).error, '沒登入的人下載得到收據')
})

test('bucket 限制大小與檔案類型', async () => {
  const big = await files(a).upload(`${a.id}/big.png`, new Uint8Array(2 * 1024 * 1024 + 1), { contentType: 'image/png' })
  assert.ok(big.error, '超過 2 MB 的檔案要被擋下：bucket 的 file_size_limit 設 2097152')
  const html = await files(a).upload(`${a.id}/x.html`, new TextEncoder().encode('<script>alert(1)<\/script>'), { contentType: 'text/html' })
  assert.ok(html.error, 'text/html 要被擋下：allowed_mime_types 只放 image/png、image/jpeg')
})
