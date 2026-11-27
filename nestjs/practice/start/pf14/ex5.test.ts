// 練習 5：GET /billing 的用量跟實際一致
import { call, email, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

describe('練習 5：用量', () => {
  it('limits 是免費方案的數字；usage 的 project、成員（含邀請）、檔案容量跟實際一致', async () => {
    const a = await signupTenant(t)
    const p1 = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '一' } })).body.id
    await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '二' } })
    expect((await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: email('usage'), role: 'member' } })).status).toBe(201)
    const form = new FormData()
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png')
    const up = await call(t, 'POST', `/api/v1/projects/${p1}/files`, { token: a.token, raw: form })
    expect(up.status, up.text.slice(0, 200)).toBe(201)

    const before = await call(t, 'GET', '/api/v1/billing', { token: a.token })
    expect(before.status).toBe(200)
    expect(before.body, 'GET /billing 要是 { plan, limits, usage }，免費方案 3 個 project、5 位成員、20 MB').toEqual({
      plan: 'free',
      limits: { projects: 3, members: 5, storageBytes: 20 * 1024 * 1024 },
      usage: { projects: 2, members: 2, storageBytes: PNG.length },
    })
    expect((await call(t, 'DELETE', `/api/v1/files/${up.body.id}`, { token: a.token })).status).toBe(204)
    const after = await call(t, 'GET', '/api/v1/billing', { token: a.token })
    expect(after.body.usage, '刪掉檔案後容量要回到 0').toEqual({ projects: 2, members: 2, storageBytes: 0 })
  })
})
