// 練習 2：404 與 409 的 errorCode；重複報名由唯一約束擋，email 不分大小寫
import { call, expectError, runId, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small')
const future = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString()
const MISSING = '00000000-0000-4000-8000-000000000000'

async function newEvent(capacity = 3) {
  const res = await call(t, 'POST', '/api/v1/events', { body: { title: '工作坊', startsAt: future(), capacity } })
  expect(res.status, `POST /api/v1/events 要 201：${res.text.slice(0, 200)}`).toBe(201)
  return res.body as { id: string; remaining: number }
}
const remaining = async (id: string) => (await call(t, 'GET', `/api/v1/events/${id}`)).body?.remaining

describe('練習 2：404 與 409', () => {
  it('不存在的活動、格式不對的 id 都是 404 EVENT_NOT_FOUND（不是 400 或 500）', async () => {
    expectError(await call(t, 'GET', `/api/v1/events/${MISSING}`), 404, 'EVENT_NOT_FOUND', '不存在的 UUID：')
    expectError(await call(t, 'GET', '/api/v1/events/abc'), 404, 'EVENT_NOT_FOUND', 'id 是 abc：')
    const body = { email: `pf-${runId()}@example.test`, name: 'Ann' }
    expectError(await call(t, 'POST', `/api/v1/events/${MISSING}/registrations`, { body }), 404, 'EVENT_NOT_FOUND', '報名不存在的活動：')
  })

  it('取消不存在的報名是 404 REGISTRATION_NOT_FOUND', async () => {
    const ev = await newEvent()
    expectError(await call(t, 'DELETE', `/api/v1/events/${ev.id}/registrations/${MISSING}`), 404, 'REGISTRATION_NOT_FOUND', '取消不存在的報名：')
    expectError(await call(t, 'DELETE', `/api/v1/events/${ev.id}/registrations/abc`), 404, 'REGISTRATION_NOT_FOUND', 'regId 是 abc：')
  })

  it('報名成功回 201，email 存成小寫', async () => {
    const ev = await newEvent()
    const id = runId()
    const res = await call(t, 'POST', `/api/v1/events/${ev.id}/registrations`, { body: { email: `Pf-${id}@Example.TEST`, name: 'Ann' } })
    expect(res.status, `報名要 201：${res.text.slice(0, 200)}`).toBe(201)
    expect(res.body?.email, '回應的 email 要是小寫：在 DTO 用 @Transform 轉小寫再存').toBe(`pf-${id}@example.test`)
    expect(res.body?.eventId, '回應要有 eventId').toBe(ev.id)
  })

  it('同一個 email 再報一次是 409 ALREADY_REGISTERED，換大小寫也一樣，而且不會多扣名額', async () => {
    const ev = await newEvent(3)
    const id = runId()
    const first = await call(t, 'POST', `/api/v1/events/${ev.id}/registrations`, { body: { email: `pf-${id}@example.test`, name: 'Ann' } })
    expect(first.status, `第一次報名要 201：${first.text.slice(0, 200)}`).toBe(201)
    expectError(await call(t, 'POST', `/api/v1/events/${ev.id}/registrations`, { body: { email: `pf-${id}@example.test`, name: 'Ann' } }),
      409, 'ALREADY_REGISTERED', '同一個 email 再報一次：唯一約束擋下時是 Prisma 的 P2002，要轉成 409，')
    expectError(await call(t, 'POST', `/api/v1/events/${ev.id}/registrations`, { body: { email: `PF-${id}@EXAMPLE.test`, name: 'Ann' } }),
      409, 'ALREADY_REGISTERED', '只換大小寫：email 要先轉小寫再存，唯一約束才擋得住，')
    expect(await remaining(ev.id), '重複報名被擋下時，扣名額要跟著回滾（扣名額與新增報名放在同一個交易）').toBe(2)
  })
})
