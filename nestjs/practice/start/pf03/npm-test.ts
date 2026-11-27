// 在學習者的 repo 執行 npm test（Vitest），回傳每個測試的結果。練習 1、2 共用
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import type { Target } from '../../helpers/portfolio.ts'

export type SpecResult = { file: string; name: string; status: string }
export type Run = { tests: SpecResult[]; ok: boolean; output: string }

const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-1500)

export function npmTest(t: Target): Run {
  const tmp = mkdtempSync(join(tmpdir(), 'learn-pf03-'))
  const out = join(tmp, 'result.json')
  // 判分程式自己的環境變數（Vitest 的、判分用的 DATABASE_URL）不能漏進學習者的測試：學習者用自己 repo 的 .env。
  // 出題檢查（參考實作）沒有自己的資料庫，留著 DATABASE_URL，參考實作的 vitest.config.ts 會換成 *_spec
  const drop = /^(VITEST|REDIS_)/
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !drop.test(k) && (t.verify || k !== 'DATABASE_URL')))
  try {
    const r = spawnSync('npm', ['test', '--', '--reporter=default', '--reporter=json', `--outputFile.json=${out}`],
      { cwd: t.repo, env: { ...env, CI: 'true', NODE_ENV: 'test' }, encoding: 'utf8', timeout: 180_000 })
    let json: any
    try { json = JSON.parse(readFileSync(out, 'utf8')) } catch {
      throw new Error(`在 ${t.repo} 執行 npm test 沒有產生 Vitest 的 JSON 結果（package.json 的 test 要是 vitest run；開發用資料庫要先啟動）：\n${clean(r.stdout + r.stderr)}`)
    }
    const tests: SpecResult[] = json.testResults.flatMap((f: any) => f.assertionResults.map((a: any) => ({ file: f.name, name: a.fullName ?? a.title, status: a.status })))
    return { tests, ok: r.status === 0 && json.success !== false, output: clean(r.stdout + r.stderr) }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// 出題檢查時，參考實作的 npm test 在課程的 PostgreSQL 建了 nest_<題號>_spec：prepare.mjs 只清 *_test，這裡自己刪
export async function dropSpecDatabase(t: Target) {
  if (!t.verify || !process.env.DATABASE_URL) return
  const url = new URL(process.env.DATABASE_URL)
  const name = url.pathname.slice(1).replace(/_test$/, '_spec')
  if (!/^nest_[a-z0-9_]+_spec$/.test(name)) return
  url.pathname = '/learn'
  const client = new pg.Client({ connectionString: url.href })
  await client.connect()
  try { await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`) } finally { await client.end() }
}
