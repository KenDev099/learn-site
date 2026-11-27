// 第 7 課判分用的共用工具（不用改這個檔）
// Storage 的 bucket 與 policy 是全站共用的（policy 都建在 storage.objects 上），所以每一題的 bucket 叫 <slug>-receipts，
// policy 名稱前面加上這一題的代號；跑完用 Storage API 刪掉檔案與 bucket，再刪掉 policy
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { slugOf, sql, stack } from '../../helpers/supa.ts'

export const bucketOf = (dir: string) => `${slugOf(dir)}-receipts`

// 學習者照正式專案的寫法寫 'receipts'、public.xxx；判分時換成這一題專屬的名字
export function localize(text: string, dir: string, schema: string): string {
  const tag = createHash('md5').update(slugOf(dir)).digest('hex').slice(0, 8)
  return text
    .replace(/'receipts'/g, `'${bucketOf(dir)}'`)
    .replace(/\bpublic\./gi, `${schema}.`)
    .replace(/create\s+policy\s+"/gi, `create policy "${tag} `)
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

// 一張很小、但檔頭正確的 PNG（8 bytes 簽章＋內容）
export const png = (n = 16) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: n }, (_, i) => i % 256)])
