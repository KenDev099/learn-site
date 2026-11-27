// 練習 2：用新的 migration 修好四個漏洞，功能照常
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUser, deleteUsers, dropTaskSchema, requireStack, sql, type TestUser } from '../../helpers/supa.ts'
import { MIGRATION_NAME, bucketOf, deploy, dropStorage, loginClient, migrationFiles, png, readMigrations, seed } from './harness.ts'

const dir = import.meta.dirname
const BASELINE = '20261120090000_cafe_orders.sql'
const BASELINE_SHA256 = 'ff122217f9083f7f3adaaccf20a6ec4fad04dcedc288301231bfb43394979bc1'
let a: TestUser, b: TestUser, staff: TestUser, schema: string | undefined
let deployError: Error | undefined

before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth', 'storage'])
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
  staff = await createUser(dir, 'staff', { app_metadata: { role: 'staff' } })
  try {
    schema = await deploy(dir, readMigrations(dir))
    await seed(dir, schema, a, b)
  } catch (e: any) {
    deployError = e
  }
})
after(async () => {
  await dropStorage(dir)
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const ready = () => { if (deployError) throw deployError; return schema! }

test('已經上線的 migration 沒有被改，修正寫在新的 migration', () => {
  const files = migrationFiles(dir)
  for (const f of files) assert.match(f, MIGRATION_NAME, `migrations/${f} 的檔名要是「14 位數時間戳_名稱.sql」（npx supabase migration new <名稱> 產生的格式）`)
  const hash = createHash('sha256').update(readFileSync(join(dir, 'migrations', BASELINE))).digest('hex')
  assert.equal(hash, BASELINE_SHA256, `${BASELINE} 已經套用到正式環境，改它不會讓正式環境跟著變（CLI 只套用還沒套用過的檔案）：把它還原，修正寫在新的 migration`)
  assert.ok(files.length >= 2 && files[0] === BASELINE, '修正要在另一個檔案，檔名的時間戳要比 ' + BASELINE + ' 晚')
})

test('所有 migration 依序套用成功', () => { ready() })

test('漏洞 1 修好了：B 從 order_report 只看得到自己的統計', async () => {
  const { data, error } = await (await loginClient(ready(), b)).from('order_report').select('customer_id, orders, revenue')
  assert.equal(error, null, `B 讀 order_report 失敗：${error?.message}。「我的消費統計」頁還要能用，不能把 view 刪掉或收回權限`)
  assert.deepEqual(data, [{ customer_id: b.id, orders: 1, revenue: 220 }], 'view 要以查詢者的身分執行（security_invoker = true），orders 的 RLS 才會套用')
})

test('漏洞 2 修好了：顧客在 user_metadata 寫 staff 也讀不到別人的訂單；真的店員（app_metadata）讀得到全部', async () => {
  const client = await loginClient(ready(), b)
  await client.auth.updateUser({ data: { role: 'staff' } })
  await client.auth.refreshSession()
  const { data } = await client.from('orders').select('customer_id')
  assert.ok(!(data ?? []).some(r => r.customer_id === a.id), '顧客 B 把自己的 user_metadata 改成 staff 就讀到 A 的訂單：店員的判斷要用 app_metadata')
  const all = await (await loginClient(schema!, staff)).from('orders').select('id')
  assert.equal(all.data?.length, 3, `店員（app_metadata.role = staff）要讀得到全部 3 張訂單，實際是 ${all.data?.length}（${all.error?.message ?? ''}）`)
})

test('漏洞 3 修好了：B 不能把檔案放進 A 的資料夾，A 還能上傳自己的收據', async () => {
  const bucket = bucketOf(dir)
  const evil = await (await loginClient(ready(), b)).storage.from(bucket).upload(`${a.id}/evil.png`, png(), { contentType: 'image/png' })
  assert.ok(evil.error, 'B 上傳到 A 的資料夾成功了：INSERT 的 WITH CHECK 要檢查 (storage.foldername(name))[1] 是自己的 id')
  const mine = await (await loginClient(schema!, a)).storage.from(bucket).upload(`${a.id}/2.png`, png(), { contentType: 'image/png' })
  assert.equal(mine.error, null, `A 上傳自己的收據失敗：${mine.error?.message}`)
})

test('漏洞 4 修好了：customer_spend 查不到別人的消費，查自己的照常', async () => {
  const other = await (await loginClient(ready(), b)).rpc('customer_spend', { customer: a.id })
  assert.ok(other.error || other.data === 0, `B 查到了 A 的累積消費（${other.data}）：函式不需要特權，改成 security invoker 讓 RLS 套用，或在函式裡檢查 customer = auth.uid()`)
  const own = await (await loginClient(schema!, a)).rpc('customer_spend', { customer: a.id })
  assert.equal(own.data, 270, `A 查自己的累積消費要是 190 + 80 = 270，實際是 ${JSON.stringify(own.data)}（${own.error?.message ?? ''}）：前端還在呼叫它，參數不能改`)
  const [{ ok }] = await sql(`select has_function_privilege('anon', $1::regprocedure, 'execute') as ok`, [`${schema}.customer_spend(uuid)`])
  assert.equal(ok, false, '沒登入的人不需要這個函式：revoke execute … from public, anon，再 grant 給 authenticated')
})

test('顧客還能讀自己的訂單、改自己訂單的備註', async () => {
  const client = await loginClient(ready(), a)
  const { data } = await client.from('orders').select('total').order('total')
  assert.deepEqual(data, [{ total: 80 }, { total: 190 }], 'A 讀自己的訂單要拿到 80、190 兩張')
  const { data: updated, error } = await client.from('orders').update({ note: '少冰' }).eq('total', 80).select('note')
  assert.equal(error, null, `A 改自己訂單的備註失敗：${error?.message}`)
  assert.deepEqual(updated, [{ note: '少冰' }])
})
