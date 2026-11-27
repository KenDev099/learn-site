// 練習 2：大小與型別的檢查
import { call, expectError, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

function upload(acc: Account, projectId: string, data: Buffer, filename: string, type: string) {
  const form = new FormData()
  form.append('file', new Blob([data], { type }), filename)
  return call(t, 'POST', `/api/v1/projects/${projectId}/files`, { token: acc.token, raw: form })
}

describe('練習 2：大小與型別', () => {
  it('超過 5 MB 回 413 FILE_TOO_LARGE', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '大檔' } })).body.id
    expectError(await upload(a, p, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'big.png', 'image/png'), 413, 'FILE_TOO_LARGE', '6 MB 的 PNG')
  })

  it('型別看內容：改名成 .png 的 HTML、改名成 .pdf 的文字檔都 415 UNSUPPORTED_FILE_TYPE', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '型別' } })).body.id
    expectError(await upload(a, p, Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'cute-cat.png', 'image/png'), 415, 'UNSUPPORTED_FILE_TYPE',
      '內容是 HTML、檔名 .png、Content-Type image/png（副檔名與瀏覽器送的型別都不能信，要看開頭的 magic bytes）')
    expectError(await upload(a, p, Buffer.from('just text'), 'report.pdf', 'application/pdf'), 415, 'UNSUPPORTED_FILE_TYPE', '內容是純文字、檔名 .pdf')
  })

  it('內容是 PNG 就接受，跟檔名無關；contentType 用偵測出來的', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '型別' } })).body.id
    const r = await upload(a, p, PNG, 'screenshot', 'application/octet-stream')
    expect(r.status, `沒有副檔名、瀏覽器送 octet-stream 的 PNG 要 201：${r.text.slice(0, 200)}`).toBe(201)
    expect(r.body.contentType, 'contentType 要是看內容偵測出來的 image/png').toBe('image/png')
  })
})
