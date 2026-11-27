// 練習 3（選做）：部署好的網址跑一組冒煙測試
import { basename, join } from 'node:path'
import { call, expectError, runId, target } from '../../helpers/portfolio.ts'

// 出題檢查沒有部署：啟動參考實作，把它當成「部署好的網址」
const verify = basename(join(import.meta.dirname, '..')) === 'verify'
const t = await target(import.meta.dirname, 'small', { http: verify })
const url = verify ? t.api : t.deployUrl?.replace(/\/+$/, '')
const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

describe('練習 3（選做）：部署後的冒煙測試', () => {
  it('health、建立活動、報名、重複報名 409', async () => {
    expect(url, '選做，未填部署網址：部署後在 work/portfolio.json 的 small 區段加 "deployUrl": "https://…"。不做這題不影響其他題').toBeTruthy()
    const d = { api: url! }
    let ready
    try { ready = await call(d, 'GET', '/health/ready') } catch { throw new Error(`連不到 ${url}：網址對嗎？服務有在跑嗎？`) }
    expect(ready.status, `${url}/health/ready 要 200：${ready.text.slice(0, 200)}`).toBe(200)
    const ev = await call(d, 'POST', '/api/v1/events', { body: { title: '冒煙測試', startsAt: future(), capacity: 2 } })
    expect(ev.status, `建立活動要 201：${ev.text.slice(0, 200)}（migration 有在部署的資料庫跑過嗎？）`).toBe(201)
    const body = { email: `pf-${runId()}@example.test`, name: '冒煙' }
    const reg = await call(d, 'POST', `/api/v1/events/${ev.body.id}/registrations`, { body })
    expect(reg.status, `報名要 201：${reg.text.slice(0, 200)}`).toBe(201)
    expectError(await call(d, 'POST', `/api/v1/events/${ev.body.id}/registrations`, { body }), 409, 'ALREADY_REGISTERED', '同一個 email 再報一次：')
  })
})
