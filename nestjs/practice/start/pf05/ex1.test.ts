// 練習 1：GitHub Actions 的 workflow：真的 PostgreSQL、migration、測試
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

// 不解析 YAML（沒有裝 YAML 套件），只用文字檢查；去掉註解，註解掉的步驟不算
function workflows(): string {
  const dir = join(t.repo, '.github', 'workflows')
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.ya?ml$/.test(f)) : []
  if (!files.length) throw new Error('找不到 .github/workflows/*.yml：在 repo 建一個 workflow（例如 .github/workflows/ci.yml）')
  return files.map(f => readFileSync(join(dir, f), 'utf8').replace(/(^|\s)#.*$/gm, '')).join('\n')
}
const text = workflows()

describe('練習 1：CI workflow', () => {
  it('有 services: 底下的 postgres 映像（測試連真的資料庫）', () => {
    expect(/^\s*services:\s*$[\s\S]*?^\s*image:\s*["']?postgres(:|["']?\s*$)/m.test(text), 'workflow 要在 job 的 services: 開一個 image: postgres:… 的容器，E2E 測試才有資料庫可連').toBe(true)
  })

  it('有一步執行 prisma migrate deploy', () => {
    expect(/prisma\s+migrate\s+deploy/.test(text), 'workflow 要在測試前執行 npx prisma migrate deploy：順便確認 migration 在全新的資料庫套得上（不要用 migrate dev）').toBe(true)
  })

  it('有一步執行 npm test', () => {
    expect(/npm\s+(run\s+)?test\b/.test(text), 'workflow 要有 run: npm test').toBe(true)
  })
})
