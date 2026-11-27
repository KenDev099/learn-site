// 練習 1：CI workflow：真的 PostgreSQL＋Redis、migration、測試、用 commit SHA 標記映像
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })

// .github/workflows/ 裡所有 workflow 合在一起（不解析 YAML，只看文字），去掉 # 註解
function workflows() {
  const dir = join(t.repo, '.github', 'workflows')
  if (!existsSync(dir)) return ''
  return readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).map(f => readFileSync(join(dir, f), 'utf8')).join('\n').replace(/(^|\s)#.*$/gm, '$1')
}
const ci = workflows()

describe('練習 1：CI workflow', () => {
  it('.github/workflows/*.yml 存在', () => {
    expect(ci, 'repo 裡找不到 .github/workflows/*.yml').not.toBe('')
  })

  it('有 PostgreSQL 與 Redis 的 service container（E2E 用真的資料庫與 Redis）', () => {
    expect(ci, 'workflow 的 services 裡沒有 image: postgres:…').toMatch(/image:\s*["']?postgres:/)
    expect(ci, 'workflow 的 services 裡沒有 image: redis:…：限流、佇列的 E2E 需要 Redis').toMatch(/image:\s*["']?redis:/)
  })

  it('跑 migration 再跑測試', () => {
    const migrate = ci.search(/prisma migrate deploy/), test = ci.search(/npm (run )?test\b|npx vitest run/)
    expect(migrate, 'workflow 要執行 npx prisma migrate deploy（不是 migrate dev）').toBeGreaterThanOrEqual(0)
    expect(test, 'workflow 要執行 npm test').toBeGreaterThanOrEqual(0)
    expect(migrate < test, 'migrate deploy 要在 npm test 之前').toBe(true)
  })

  it('測試失敗時 CI 一定失敗（沒有 continue-on-error、|| true）', () => {
    expect(ci, 'workflow 有 continue-on-error: true：測試壞了 CI 照樣綠燈，等於沒有 CI').not.toMatch(/continue-on-error:\s*true/)
    expect(ci, 'workflow 有 `|| true`：指令失敗被吞掉了').not.toMatch(/\|\|\s*true/)
  })

  it('build 映像，標籤用 commit SHA（不是 latest）', () => {
    expect(ci, 'workflow 要 build 映像（docker build 或 docker/build-push-action）').toMatch(/docker build|docker\/build-push-action/)
    expect(ci, '映像標籤要用 ${{ github.sha }}：同一個標籤永遠對到同一份程式，部署與回滾才知道是哪個版本').toMatch(/github\.sha/)
    expect(ci, '不要用 :latest 標籤：它會一直被覆蓋，出事時說不出線上跑的是哪個版本').not.toMatch(/:latest\b/)
  })
})
