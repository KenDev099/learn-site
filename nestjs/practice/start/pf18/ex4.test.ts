// 練習 4：錯誤回應（400、404、409）不洩漏 Prisma、stack、資料表與約束名稱
import { call, PASSWORD, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const LEAK = /Prisma|prisma\.|invocation|Unique constraint|duplicate key|violates|\bat \S+ \(|node_modules|\.(js|ts):\d+:\d+|\b(users|projects|memberships|tenants)_\w+_(key|fkey|pkey)\b|"public"\./

describe('練習 4：錯誤不洩漏內部資訊', () => {
  it('404（id 格式不對、不存在）、400（驗證失敗）、409（email 已註冊）的 body 不含內部資訊', async () => {
    const a = await signupTenant(t)
    const cases = {
      '404 id 格式不對': await call(t, 'GET', '/api/v1/projects/not-a-uuid', { token: a.token }),
      '404 不存在': await call(t, 'GET', '/api/v1/projects/00000000-0000-4000-8000-000000000000', { token: a.token }),
      '400 驗證失敗': await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 123 } }),
      '409 email 已註冊': await call(t, 'POST', '/api/v1/auth/signup', { body: { email: a.email.toUpperCase(), password: PASSWORD, name: 'x', tenantName: 'y' } }),
    }
    for (const [what, r] of Object.entries(cases)) {
      expect(r.status, `${what}：狀態碼 ${r.status}：${r.text.slice(0, 200)}`).toBe(Number(what.slice(0, 3)))
      expect(r.text, `${what}：回應帶了內部資訊（攻擊者用它推測資料表結構與套件）。message 自己寫給人看的句子，不要把例外的 message 原樣傳出去：${r.text.slice(0, 300)}`).not.toMatch(LEAK)
    }
  })
})
