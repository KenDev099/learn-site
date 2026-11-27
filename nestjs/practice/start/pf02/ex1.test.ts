// 練習 1：輸入驗證與一致的錯誤格式
import { call, email, expectError, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small')
const future = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString()
const good = () => ({ title: '讀書會', startsAt: future(), capacity: 3 })

describe('練習 1：驗證失敗一律 400 VALIDATION_FAILED', () => {
  it('建立活動：每一種壞輸入都是 400 VALIDATION_FAILED', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['title 是空字串', { ...good(), title: '' }],
      ['title 超過 100 字', { ...good(), title: 'x'.repeat(101) }],
      ['少了 title', { startsAt: future(), capacity: 3 }],
      ['startsAt 不是 ISO 時間', { ...good(), startsAt: '下週三晚上' }],
      ['startsAt 是過去的時間', { ...good(), startsAt: '2020-01-01T00:00:00.000Z' }],
      ['capacity 是 0', { ...good(), capacity: 0 }],
      ['capacity 是 501', { ...good(), capacity: 501 }],
      ['capacity 是小數', { ...good(), capacity: 2.5 }],
      ['capacity 是字串', { ...good(), capacity: '3' }],
    ]
    for (const [what, body] of cases) expectError(await call(t, 'POST', '/api/v1/events', { body }), 400, 'VALIDATION_FAILED', `${what}：`)
  })

  it('多餘的欄位被拒絕（例如自己送 remaining），不是默默忽略', async () => {
    const res = await call(t, 'POST', '/api/v1/events', { body: { ...good(), remaining: 999 } })
    expectError(res, 400, 'VALIDATION_FAILED', '送了 DTO 沒宣告的 remaining：ValidationPipe 要設 whitelist＋forbidNonWhitelisted。')
  })

  it('報名：email 格式不對、少了 name、多餘欄位都是 400', async () => {
    const ev = await call(t, 'POST', '/api/v1/events', { body: good() })
    expect(ev.status, `建立活動要 201：${ev.text.slice(0, 200)}`).toBe(201)
    for (const [what, body] of [
      ['email 不是 email', { email: 'not-an-email', name: 'Ann' }],
      ['少了 name', { email: email('reg') }],
      ['多餘欄位 eventId', { email: email('reg'), name: 'Ann', eventId: ev.body.id }],
    ] as const) expectError(await call(t, 'POST', `/api/v1/events/${ev.body.id}/registrations`, { body }), 400, 'VALIDATION_FAILED', `${what}：`)
  })

  it('列表：壞掉的 cursor、超出範圍的 limit 是 400，不是 500', async () => {
    expectError(await call(t, 'GET', '/api/v1/events?cursor=abc'), 400, 'VALIDATION_FAILED', 'cursor=abc：')
    expectError(await call(t, 'GET', '/api/v1/events?limit=0'), 400, 'VALIDATION_FAILED', 'limit=0：')
    expectError(await call(t, 'GET', '/api/v1/events?limit=101'), 400, 'VALIDATION_FAILED', 'limit=101：')
  })

  it('錯誤回應是 { statusCode, errorCode, message, requestId }，requestId 等於回應標頭 x-request-id', async () => {
    const res = await call(t, 'POST', '/api/v1/events', { body: { ...good(), capacity: 0 } })
    expect(res.body?.statusCode, 'body 要有 statusCode，跟 HTTP 狀態碼一樣').toBe(400)
    expect(typeof res.body?.message, 'body 要有 message（給人看的說明）').toBe('string')
    const header = res.headers.get('x-request-id')
    expect(header, '回應要有 x-request-id 標頭：用 middleware 每個請求產生一個').toBeTruthy()
    expect(res.body?.requestId, '錯誤回應的 requestId 要等於標頭 x-request-id：exception filter 從 req 讀同一個值').toBe(header)
  })
})
