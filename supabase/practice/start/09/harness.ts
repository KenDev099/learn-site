// 第 9 課判分用的共用工具（不用改這個檔）
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { applySql, clientFor, privateSchema, slugOf, sql, stack, taskSchema, type TestUser } from '../../helpers/supa.ts'

export const bucketOf = (dir: string) => `${slugOf(dir)}-receipts`
export const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/

// migrations/ 裡的檔案，依檔名（時間戳）排序：Supabase CLI 套用的順序
export const migrationFiles = (dir: string) => readdirSync(join(dir, 'migrations')).filter(f => f.endsWith('.sql')).sort()

// 學習者照正式專案的寫法寫 public.、private.、'receipts'；判分時換成這一題專屬的名字。policy 名稱加上這一題的代號（storage.objects 是全站共用的）
export function localize(text: string, dir: string, schema: string): string {
  const tag = createHash('md5').update(slugOf(dir)).digest('hex').slice(0, 8)
  return text
    .replace(/'receipts'/g, `'${bucketOf(dir)}'`)
    .replace(/\bpublic\./gi, `${schema}.`)
    .replace(/\bprivate\./gi, `p_${schema.slice(2)}.`)
    .replace(/(schema\s+(if\s+not\s+exists\s+)?)private\b/gi, `$1p_${schema.slice(2)}`)
    .replace(/(on\s+schema\s+)private\b/gi, `$1p_${schema.slice(2)}`)
    .replace(/(create|alter|drop)\s+policy\s+(if\s+exists\s+)?"/gi, (_, verb, ifExists = '') => `${verb} policy ${ifExists}"${tag} `)
}

// 刪掉這一題的檔案、bucket，以及條件裡提到這個 bucket 的 policy（直接 delete storage 的表會被擋，要走 Storage API）
export async function dropStorage(dir: string) {
  const bucket = bucketOf(dir)
  const admin = createClient(stack().API_URL, stack().SECRET_KEY, { auth: { persistSession: false } })
  const files = await sql<{ name: string }>('select name from storage.objects where bucket_id = $1', [bucket])
  if (files.length) await admin.storage.from(bucket).remove(files.map(f => f.name))
  if ((await sql('select 1 from storage.buckets where id = $1', [bucket])).length) {
    const { error } = await admin.storage.deleteBucket(bucket)
    if (error) throw new Error(`刪除 bucket ${bucket} 失敗：${error.message}`)
  }
  const policies = await sql<{ policyname: string }>(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') like $1 or coalesce(with_check, '') like $1)`, [`%'${bucket}'%`])
  for (const p of policies) await sql(`drop policy "${p.policyname.replaceAll('"', '""')}" on storage.objects`)
}

// 從零開始：清掉舊的，依序套用 files（檔名）裡的 migration，等 PostgREST 載入函式。回傳 schema
export async function deploy(dir: string, sources: { name: string, text: string }[]): Promise<string> {
  await dropStorage(dir)
  const schema = await taskSchema(dir)
  await privateSchema(dir)
  for (const { name, text } of sources) {
    try {
      await applySql(schema, localize(text, dir, schema))
    } catch (e: any) {
      throw new Error(`套用 migrations/${name} 失敗：${e.message}`)
    }
  }
  const { API_URL, PUBLISHABLE_KEY } = stack()
  for (let i = 0; i < 50; i++) {   // customer_spend 進了 PostgREST 的 schema cache（不再回 PGRST202）
    const r = await fetch(`${API_URL}/rest/v1/rpc/customer_spend`, { method: 'POST', body: '{"customer":"00000000-0000-0000-0000-000000000000"}',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Profile': schema, 'Content-Type': 'application/json' } })
    if (!(await r.text()).includes('PGRST202')) return schema
    await new Promise(res => setTimeout(res, 200))
  }
  throw new Error('PostgREST 10 秒內找不到 public.customer_spend(customer uuid)：前端還在用它，修的時候不能拿掉或改參數')
}

export const readMigrations = (dir: string) => migrationFiles(dir).map(name => ({ name, text: readFileSync(join(dir, 'migrations', name), 'utf8') }))

// 一張很小、但檔頭正確的 PNG
export const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

// 測試資料：顧客 A 兩張訂單（190、80），顧客 B 一張（220）；A 在自己的資料夾有一張收據
export async function seed(dir: string, schema: string, a: TestUser, b: TestUser) {
  await sql(`update auth.users set raw_user_meta_data = '{}' where id in ($1, $2)`, [a.id, b.id])
  await sql(`insert into ${schema}.orders (customer_id, total) values ($1, 190), ($1, 80), ($2, 220)`, [a.id, b.id])
  const up = await clientFor(schema, a).storage.from(bucketOf(dir)).upload(`${a.id}/1.png`, png(), { contentType: 'image/png' })
  if (up.error) throw new Error(`顧客 A 上傳自己的收據失敗（${up.error.message}）：修的時候不能把正常的上傳也擋掉`)
}

// 用密碼登入的 client（session 在 client 裡，可以 updateUser、refreshSession），指向這一題的 schema
export async function loginClient(schema: string, user: TestUser) {
  const client = createClient(stack().API_URL, stack().PUBLISHABLE_KEY, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw new Error(`測試使用者 ${user.email} 登入失敗：${error.message}`)
  return client
}
