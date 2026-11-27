// 練習 3：名額在併發時不超賣；取消會把名額還回去
import { call, concurrent, expectError, runId, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small')
const future = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString()

async function newEvent(capacity: number) {
  const res = await call(t, 'POST', '/api/v1/events', { body: { title: '工作坊', startsAt: future(), capacity } })
  expect(res.status, `POST /api/v1/events 要 201：${res.text.slice(0, 200)}`).toBe(201)
  return res.body as { id: string }
}
const remaining = async (id: string) => (await call(t, 'GET', `/api/v1/events/${id}`)).body?.remaining
const register = (eventId: string) => call(t, 'POST', `/api/v1/events/${eventId}/registrations`, { body: { email: `pf-${runId()}@example.test`, name: '搶名額' } })

describe('練習 3：名額', () => {
  it('名額 3 的活動同時收到 10 個報名：恰好 3 個 201、7 個 409 EVENT_FULL，remaining 是 0', async () => {
    const ev = await newEvent(3)
    const results = await concurrent(10, 10, () => register(ev.id))
    const created = results.filter(r => r.status === 201).length
    const full = results.filter(r => r.status === 409 && r.body?.errorCode === 'EVENT_FULL').length
    const other = results.filter(r => r.status !== 201 && !(r.status === 409 && r.body?.errorCode === 'EVENT_FULL'))
    expect(other.map(r => `${r.status} ${r.text.slice(0, 120)}`), '除了 201 與 409 EVENT_FULL 不該有別的回應（500 多半是 CHECK 約束擋下了負數名額）').toEqual([])
    expect(created, `成功報名 ${created} 個，名額只有 3：「先查剩幾個再新增」在併發時會超賣，改成交易裡的條件式 UPDATE（remaining > 0 才扣）或 SELECT … FOR UPDATE`).toBe(3)
    expect(full, '其餘 7 個要是 409 EVENT_FULL').toBe(7)
    expect(await remaining(ev.id), '名額全部報完後 remaining 要是 0').toBe(0)
  })

  it('取消一筆報名：204，remaining 加回 1，空出來的名額可以再報', async () => {
    const ev = await newEvent(1)
    const r = await register(ev.id)
    expect(r.status, `報名要 201：${r.text.slice(0, 200)}`).toBe(201)
    expectError(await register(ev.id), 409, 'EVENT_FULL', '名額 1 已經報滿：')
    const del = await call(t, 'DELETE', `/api/v1/events/${ev.id}/registrations/${r.body.id}`)
    expect(del.status, `取消報名要 204：${del.text.slice(0, 200)}`).toBe(204)
    expect(await remaining(ev.id), '取消後 remaining 要加回 1：刪除報名與加回名額放在同一個交易').toBe(1)
    const again = await register(ev.id)
    expect(again.status, `空出來的名額要能再報（201）：${again.text.slice(0, 200)}`).toBe(201)
    expectError(await call(t, 'DELETE', `/api/v1/events/${ev.id}/registrations/${r.body.id}`), 404, 'REGISTRATION_NOT_FOUND', '同一筆取消兩次：第二次要 404，名額不能加兩次，')
    expect(await remaining(ev.id), '取消兩次不能讓 remaining 多加').toBe(0)
  })
})
