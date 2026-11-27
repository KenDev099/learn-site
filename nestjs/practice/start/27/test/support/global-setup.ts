import { spawnSync } from 'node:child_process'
import pg from 'pg'

// npm test 開始時在 Vitest 的主程序執行一次（測試檔還沒開始跑）：
// 1. 測試資料庫不存在就建立（不會刪掉重建：測試失敗後，你還能連進去看留下的資料）
// 2. 套用 prisma/migrations（prisma migrate deploy：只套用還沒套用的 migration，不會刪資料）
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  const name = url.pathname.slice(1)
  if (!/^[a-z0-9_]+_spec$/.test(name)) throw new Error(`測試只能用 *_spec 資料庫，現在是「${name}」：檢查 vitest.config.ts`)

  const admin = new pg.Client({ connectionString: url.href.replace(`/${name}`, '/postgres') })
  await admin.connect()
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { encoding: 'utf8', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' } })
  if (r.status !== 0) throw new Error(`prisma migrate deploy 失敗：\n${r.stdout}${r.stderr}`)
}
