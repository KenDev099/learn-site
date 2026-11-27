// learn/check.mjs 每次跑測試前先執行：node prepare.mjs <work/題號 或 verify/題號-pid-label>，cwd 是 supabase/practice
// 非 0 結束時每一題都算沒過，stderr 的訊息會顯示在課程頁上，所以要寫清楚怎麼修
// 1. 課程的 Supabase CLI 裝好了、Docker 在跑、本機 Supabase（learn-supabase）在跑
// 2. 清掉資料夾已經不在的題目留下的東西：t_<slug>／p_<slug> schema、<slug>-*@learn.test 使用者、<slug>-receipts bucket 與它的 policy、
//    第 8 課的 Edge Function 容器 learn-supabase-<slug>-*（出題檢查每次的資料夾名稱都不同，被中斷的判分也會留下這些）
import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { PRACTICE, UP_CMD, slugOf, sql, stack, syncSchemas } from './helpers/supa.ts'

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(join(PRACTICE, 'node_modules', '.bin', 'supabase'))) fail('還沒安裝課程的套件：在 learn 資料夾執行 npm --prefix supabase/practice ci')
if (spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 }).status !== 0) fail([
  'Docker 沒有在執行，本機 Supabase 跑不起來。',
  '1. 打開 Docker Desktop（終端機可以執行 open -a Docker），等 docker info 不再出錯',
  `2. 在 learn 資料夾執行 ${UP_CMD}`,
  '3. 再執行一次 node check.mjs',
].join('\n'))
try { stack() } catch (e) { fail(e.message) }

const live = new Set(['work', 'verify'].flatMap(d => existsSync(join(PRACTICE, d)) ? readdirSync(join(PRACTICE, d)).map(n => slugOf(join(PRACTICE, d, n))) : []))
try {
  const schemas = await sql(`select nspname from pg_namespace where nspname ~ '^[tp]_[a-z0-9_]+$'`)
  const stale = schemas.map(r => r.nspname).filter(n => !live.has(n.slice(2)))
  for (const n of stale) await sql(`drop schema if exists ${n} cascade`)
  if (stale.length) await syncSchemas()
  const users = await sql(`select id, email from auth.users where email like '%@learn.test'`)
  for (const u of users) if (!live.has(u.email.split('-')[0])) await sql('delete from auth.users where id = $1', [u.id])
  // Storage（第 7、9 課）：bucket 叫 <slug>-receipts，policy 條件裡會寫到 bucket 名稱。檔案要走 Storage API 才刪得掉
  const buckets = await sql(`select id from storage.buckets where id ~ '^[a-z0-9_]+-receipts$'`)
  const staleBuckets = buckets.map(b => b.id).filter(id => !live.has(id.slice(0, -'-receipts'.length)))
  if (staleBuckets.length) {
    const admin = createClient(stack().API_URL, stack().SECRET_KEY, { auth: { persistSession: false } })
    for (const bucket of staleBuckets) {
      const files = await sql('select name from storage.objects where bucket_id = $1', [bucket])
      if (files.length) await admin.storage.from(bucket).remove(files.map(f => f.name))
      await admin.storage.deleteBucket(bucket)
      const policies = await sql(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') like $1 or coalesce(with_check, '') like $1)`, [`%'${bucket}'%`])
      for (const p of policies) await sql(`drop policy "${p.policyname.replaceAll('"', '""')}" on storage.objects`)
    }
  }
} catch (e) {
  fail(`清除舊的判分資料失敗（${stack().DB_URL}）：${e.message}\n執行 npm --prefix supabase/practice run status 確認資料庫在跑。`)
}

// 第 8 課的 Edge Function 容器：名稱是 learn-supabase-<slug 的 _ 換成 ->-<函式名>（課程的 Supabase 本身叫 supabase_*_learn-supabase，不會被比對到）
const dashed = [...live].map(s => `learn-supabase-${s.replaceAll('_', '-')}-`)
const containers = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n')
  .filter(n => /^learn-supabase-[wv]\d/.test(n) && !dashed.some(p => n.startsWith(p)))
if (containers.length) spawnSync('docker', ['rm', '-f', ...containers], { stdio: 'ignore' })
