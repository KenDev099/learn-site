// 練習 2：schema 與 migration、.env 不進 git
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

// 所有 migration 的 SQL，去掉註解後切成一句一句
function statements() {
  const dir = join(t.repo, 'prisma', 'migrations')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())
    .map(d => join(dir, d.name, 'migration.sql')).filter(existsSync)
    .flatMap(f => readFileSync(f, 'utf8').replace(/--.*$/gm, '').split(';'))
}

describe('練習 2：migration 與 git', () => {
  it('prisma/migrations/*/migration.sql 存在', () => {
    expect(statements().length, '找不到 prisma/migrations/*/migration.sql：在 repo 執行 npx prisma migrate dev --name init').toBeGreaterThan(0)
  })

  it('同一個活動的 email 有唯一約束（UNIQUE，含 event 與 email 兩個欄位）', () => {
    const ok = statements().some(s => /\bUNIQUE\b/i.test(s) && /event/i.test(s) && /email/i.test(s))
    expect(ok, 'migration 裡沒有 (event_id, email) 的 UNIQUE：schema.prisma 的 Registration 加 @@unique([eventId, email])').toBe(true)
  })

  it('名額有 CHECK 約束（capacity）', () => {
    const ok = statements().some(s => /\bCHECK\s*\(/i.test(s) && /capacity/i.test(s))
    expect(ok, 'migration 裡沒有跟 capacity 有關的 CHECK：Prisma schema 寫不出 CHECK，要用 --create-only 產生 migration 後手動加').toBe(true)
  })

  it('.env.example 存在，.env 寫在 .gitignore', () => {
    expect(repoFile(t, '.env.example'), '要有 .env.example：列出需要的環境變數（值用開發用的假值），讓別人 clone 下來知道要設什麼').not.toBeNull()
    const ignore = (repoFile(t, '.gitignore') ?? '').split('\n').map(l => l.trim())
    expect(ignore.some(l => /^\/?\.env(\*|\.\*)?$/.test(l)), '.gitignore 要有一行 .env：密碼與金鑰不能進 git').toBe(true)
  })

  it('.env 沒有被 git 追蹤（repo 是 git repo 時才檢查）', () => {
    const inRepo = spawnSync('git', ['-C', t.repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
    if (inRepo.status !== 0 || t.verify) return
    const tracked = spawnSync('git', ['-C', t.repo, 'ls-files', '.env'], { encoding: 'utf8' }).stdout.trim()
    expect(tracked, '.env 已經被 git 追蹤：執行 git rm --cached .env 再 commit（裡面的密碼要當成已外洩，換掉）').toBe('')
  })
})
