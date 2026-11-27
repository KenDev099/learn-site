// 在 PR-58 的程式上跑你寫的 tree/api/src/coupons/coupons.race.spec.ts
//   npm run review:race             → 在 PR 第一版（tree/）上跑
//   npm run review:race -- round2   → 在作者推的第二版（tree/ 蓋上 round2/）上跑
// 每次把程式組到 reviews/PR-58/.run/<版本>/，用獨立的資料庫 cafe_pr（每次重建，不動開發用的 cafe）
// 判分也用這個檔案的函式，只是資料庫和資料夾換成判分專用的
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = import.meta.dirname
export const SPEC = 'api/src/coupons/coupons.race.spec.ts'

function findUp(name, from) {
  for (let d = from; ; d = dirname(d)) {
    if (existsSync(join(d, name))) return join(d, name)
    if (dirname(d) === d) throw new Error(`找不到 ${name}`)
  }
}
const bin = findUp(join('node_modules', '.bin'), here)
const clean = s => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim()
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))

// 組出一份可以執行的程式：tree/ → 蓋上 round2/（如果要）→ 蓋上 files（判分用的修正版）→ 放進 spec
export function buildTree(dest, { round2 = false, files = {}, spec = join(here, 'tree', SPEC) } = {}) {
  rmSync(dest, { recursive: true, force: true })
  cpSync(join(here, 'tree'), dest, { recursive: true, filter: src => !/[/\\](generated|node_modules)$|[/\\]api[/\\]\.env$/.test(src) })
  if (round2) cpSync(join(here, 'round2'), dest, { recursive: true })
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dest, file), content)
  if (existsSync(spec)) {
    mkdirSync(dirname(join(dest, SPEC)), { recursive: true })
    copyFileSync(spec, join(dest, SPEC))
  }
  copyFileSync(join(dest, 'api/.env.example'), join(dest, 'api/.env'))
}

// 重建資料庫、產生 Prisma Client、套用 migration 與種子資料
export async function setupDatabase(dest, url) {
  const name = new URL(url).pathname.slice(1)
  const client = new pg.Client({ connectionString: url.replace(`/${name}`, '/learn'), connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await client.query(`CREATE DATABASE "${name}"`)
  } catch (e) {
    throw new Error(`連不上課程的 PostgreSQL（127.0.0.1:5436）：${e.message}\n先在 work/07 執行 docker compose up -d --wait`)
  } finally {
    await client.end().catch(() => {})
  }
  for (const args of [['generate'], ['migrate', 'deploy'], ['db', 'seed']]) {
    const r = spawnSync(join(bin, 'prisma'), args, {
      cwd: join(dest, 'api'), encoding: 'utf8', timeout: 120_000,
      env: { ...env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1', PATH: `${bin}:${env.PATH}` },
    })
    if (r.status !== 0) throw new Error(`prisma ${args.join(' ')} 失敗：\n${clean(r.stdout + r.stderr)}`)
  }
}

// 只跑 race spec。json：回傳 Vitest 的 JSON 結果（判分用）；否則直接印在終端機
export function runSpec(dest, url, { json = false } = {}) {
  const out = join(dest, '.race-result.json')
  rmSync(out, { force: true })
  const args = [join(bin, '../vitest/vitest.mjs'), 'run', SPEC, ...(json ? ['--reporter=json', `--outputFile=${out}`] : [])]
  const r = spawnSync(process.execPath, args, {
    cwd: dest, encoding: 'utf8', timeout: 120_000, stdio: json ? 'pipe' : 'inherit',
    env: { ...env, DATABASE_URL: url, TZ: 'UTC' },
  })
  if (!json) return { ok: r.status === 0 }
  const output = clean(`${r.stdout ?? ''}${r.stderr ?? ''}`).slice(-2000)
  if (!existsSync(out)) return { output }
  return { result: JSON.parse(readFileSync(out, 'utf8')), output }
}

if (import.meta.main) {
  const round2 = process.argv[2] === 'round2'
  const dest = join(here, '.run', round2 ? 'round2' : 'pr')
  const url = 'postgresql://learn:learn@127.0.0.1:5436/cafe_pr'
  if (!existsSync(join(here, 'tree', SPEC))) {
    console.error(`找不到 reviews/PR-58/tree/${SPEC}，先寫好你的測試`)
    process.exit(1)
  }
  console.log(`▶ 在 PR-58 ${round2 ? '第二版（round2）' : '第一版'}的程式上跑 ${SPEC}`)
  buildTree(dest, { round2 })
  await setupDatabase(dest, url)
  const { ok } = runSpec(dest, url)
  console.log(ok ? '\n結果：通過（這一版沒有被你的測試抓到問題）' : '\n結果：失敗（你的測試在這一版上抓到問題了）')
}
