// 練習 3：錯誤回應不洩漏內部資訊；未預期的錯誤一律 500 INTERNAL_ERROR
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
// stack 的一行（at 函式 (檔案:行:欄)）、node_modules 路徑、Prisma 與 PostgreSQL 的錯誤原文
const LEAK = /\bat \S+ \(|\bat \/|node_modules|\.(js|ts):\d+:\d+|Prisma|prisma\.|invocation|invalid byte sequence|SQLSTATE|duplicate key|violates/

describe('練習 3：錯誤不洩漏內部資訊', () => {
  it('壞掉的 JSON：400 VALIDATION_FAILED，沒有 stack', async () => {
    const r = await call(t, 'POST', '/api/v1/auth/login', { raw: '{"email":', headers: { 'content-type': 'application/json' } })
    expect(r.status, `壞掉的 JSON 要 400，實際 ${r.status}`).toBe(400)
    expect(r.body?.errorCode, '壞掉的 JSON 的 errorCode 要是 VALIDATION_FAILED（契約）').toBe('VALIDATION_FAILED')
    expect(r.text, `回應帶了內部資訊：${r.text.slice(0, 200)}`).not.toMatch(LEAK)
  })

  it('資料庫拒絕的輸入（名稱含 NUL 字元）：400 或 500 INTERNAL_ERROR，不帶 stack 與資料庫訊息', async () => {
    const a = await signupTenant(t)
    const r = await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'a\u0000b' } })
    expect([400, 500], `PostgreSQL 的 text 不能存 NUL（\\u0000）。驗證時擋下回 400 最好；沒擋到時資料庫丟錯，要變成 500。實際 ${r.status}：${r.text.slice(0, 200)}`).toContain(r.status)
    if (r.status === 500) expect(r.body?.errorCode, '未預期的錯誤 errorCode 一律 INTERNAL_ERROR').toBe('INTERNAL_ERROR')
    expect(r.text, `回應帶了內部資訊（細節只寫進 log，回應只給 requestId）：${r.text.slice(0, 300)}`).not.toMatch(LEAK)
    expect(r.body?.requestId, '錯誤回應要有 requestId，使用者回報時才找得到 log').toBe(r.headers.get('x-request-id'))
  })
})
