// 練習 1：每個回應都有 x-request-id；合法的沿用，不合法的換掉（擋 log injection）
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const id = (r: { headers: Headers }) => r.headers.get('x-request-id')

describe('練習 1：x-request-id', () => {
  it('成功、401、404、壞掉的 JSON，回應都有 x-request-id', async () => {
    const cases: [string, Promise<{ status: number; headers: Headers }>][] = [
      ['GET /health/live', call(t, 'GET', '/health/live')],
      ['GET /api/v1/me（沒登入）', call(t, 'GET', '/api/v1/me')],
      ['GET /api/v1/不存在', call(t, 'GET', '/api/v1/no-such-route')],
      ['POST /api/v1/auth/login（壞掉的 JSON）', call(t, 'POST', '/api/v1/auth/login', { raw: '{"email":', headers: { 'content-type': 'application/json' } })],
    ]
    for (const [what, p] of cases) {
      const r = await p
      expect(id(r), `${what}（${r.status}）的回應沒有 x-request-id。壞掉的 JSON 在 body parser 就失敗，還沒進到 Nest 的 middleware：產生 requestId 的 middleware 要在 body parser 之前套用`).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    }
  })

  it('沒帶 x-request-id 時，每個請求的 id 都不一樣', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => call(t, 'GET', '/health/live').then(id)))
    expect(new Set(ids).size, `5 個請求的 id：${ids.join('、')}。每個請求要產生新的（例如 randomUUID()），不能共用`).toBe(5)
  })

  it('帶合法的 x-request-id（英數、-、_，64 字內）會被沿用', async () => {
    const a = await signupTenant(t)
    for (const v of ['abc-123', 'trace_ABC_9', 'x'.repeat(64)]) {
      const r = await call(t, 'GET', '/api/v1/me', { token: a.token, headers: { 'x-request-id': v } })
      expect(id(r), `送 x-request-id: ${v.slice(0, 20)}，回應要沿用同一個值（上游的負載平衡器或前端產生的 id，才串得起來）`).toBe(v)
    }
  })

  it('不合法的 x-request-id（太長、有空白或符號）會被換掉', async () => {
    for (const v of ['x'.repeat(300), 'a b', '<script>', 'id"injected":true']) {
      const r = await call(t, 'GET', '/health/live', { headers: { 'x-request-id': v } })
      expect(id(r), `送 x-request-id: ${v.slice(0, 20)}… 被原樣沿用：這個值會寫進每一行 log，攻擊者可以偽造 log 或塞爆 log。只接受 /^[A-Za-z0-9_-]{1,64}$/，其他的換成新的 id`).not.toBe(v)
      expect(id(r), '換掉之後也要有一個合法的 id').toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    }
  })
})
