// 練習 3：檔案的租戶隔離
import { call, expectError, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

function upload(acc: Account, projectId: string) {
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png')
  return call(t, 'POST', `/api/v1/projects/${projectId}/files`, { token: acc.token, raw: form })
}

describe('練習 3：別的租戶的檔案', () => {
  it('B 讀 A 的 metadata、內容、刪除都 404；A 的檔案還在', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'A 的' } })).body.id
    const up = await upload(a, p)
    expect(up.status, up.text.slice(0, 200)).toBe(201)
    expectError(await call(t, 'GET', `/api/v1/files/${up.body.id}`, { token: b.token }), 404, 'NOT_FOUND', 'B 讀 A 的 metadata')
    expectError(await call(t, 'GET', `/api/v1/files/${up.body.id}/content`, { token: b.token }), 404, 'NOT_FOUND', 'B 下載 A 的檔案')
    expectError(await call(t, 'DELETE', `/api/v1/files/${up.body.id}`, { token: b.token }), 404, 'NOT_FOUND', 'B 刪 A 的檔案')
    expect((await call(t, 'GET', `/api/v1/files/${up.body.id}`, { token: a.token })).status, 'B 刪不掉，A 的檔案要還在').toBe(200)
  })

  it('B 用 A 的 project ID 上傳：404，檔案不會掛到 A 的 project', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'A 的' } })).body.id
    expectError(await upload(b, p), 404, 'NOT_FOUND', 'B 上傳到 A 的 project')
  })
})
