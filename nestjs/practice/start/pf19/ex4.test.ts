// 練習 4：demo 腳本當成回歸測試：面試時 3 分鐘展示的那條路，一次跑完
import { addMember, call, concurrent, expectError, pollUntil, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

describe('練習 4：demo 腳本', () => {
  it('owner 註冊 → 邀請 member → member 建立 project、上傳檔案、匯出 → 另一個租戶什麼都看不到 → 稽核與用量對得上', async () => {
    const owner = await signupTenant(t), other = await signupTenant(t)
    const member = await addMember(t, owner, 'member')

    const p = await call(t, 'POST', '/api/v1/projects', { token: member.token, body: { name: 'Demo 專案' } })
    expect(p.status, `member 建立 project 要 201：${p.text.slice(0, 200)}`).toBe(201)
    const form = new FormData()
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'logo.png')
    const f = await call(t, 'POST', `/api/v1/projects/${p.body.id}/files`, { token: member.token, raw: form })
    expect(f.status, `上傳檔案要 201：${f.text.slice(0, 200)}`).toBe(201)
    const ex = await call(t, 'POST', '/api/v1/exports', { token: member.token, body: { type: 'projects' } })
    expect(ex.status, `建立匯出要 202：${ex.text.slice(0, 200)}`).toBe(202)
    await pollUntil(async () => (await call(t, 'GET', `/api/v1/exports/${ex.body.id}`, { token: member.token })).body?.status === 'done', { what: '匯出完成' })
    const csv = await call(t, 'GET', `/api/v1/exports/${ex.body.id}/content`, { token: member.token })
    expect(csv.text, '匯出的 CSV 要有剛建立的 project').toContain('Demo 專案')

    for (const [what, path] of [['project', `/api/v1/projects/${p.body.id}`], ['檔案', `/api/v1/files/${f.body.id}`], ['匯出', `/api/v1/exports/${ex.body.id}`]]) {
      expectError(await call(t, 'GET', path, { token: other.token }), 404, 'NOT_FOUND', `另一個租戶讀 ${what} `)
    }

    const logs = (await call(t, 'GET', '/api/v1/audit-logs', { token: owner.token })).body?.items ?? []
    const actions = logs.map((l: { action: string }) => l.action)
    expect(actions, '稽核要記到 demo 裡的每個動作').toEqual(expect.arrayContaining(['invitation.created', 'invitation.accepted', 'project.created', 'file.uploaded', 'export.requested']))
    const billing = await call(t, 'GET', '/api/v1/billing', { token: owner.token })
    expect(billing.body?.usage, '用量要跟 demo 做的一樣：1 個 project、2 位成員').toMatchObject({ projects: 1, members: 2 })
  })

  it('壓力下也一樣：同一個租戶同時送 10 個建立 project，免費方案恰好停在 3 個', async () => {
    const a = await signupTenant(t)
    const codes = await concurrent(10, 10, () => call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'race' } }).then(r => r.status))
    expect(codes.filter(c => c === 201).length, `10 個同時建立，201 有 ${codes.filter(c => c === 201).length} 個（要 3 個）：用量檢查與建立要在同一個交易裡、鎖住租戶列`).toBe(3)
    expect((await call(t, 'GET', '/api/v1/projects', { token: a.token })).body?.items?.length).toBe(3)
  })

  it('健康檢查、OpenAPI 與 requestId：面試官打開網址時第一眼看到的', async () => {
    expect((await call(t, 'GET', '/health/ready')).status, '/health/ready 要 200').toBe(200)
    expect(String((await call(t, 'GET', '/openapi.json')).body?.openapi), '/openapi.json 要是 OpenAPI 3.x').toMatch(/^3\./)
    const r = await call(t, 'GET', '/api/v1/me')
    expect(r.body?.requestId, '錯誤回應的 requestId 要等於 x-request-id').toBe(r.headers.get('x-request-id'))
  })
})
