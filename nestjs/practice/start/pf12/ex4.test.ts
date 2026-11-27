// 練習 4：下載的回應標頭
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

describe('練習 4：下載一律當附件', () => {
  it('Content-Disposition: attachment＋filename*（中文檔名）、X-Content-Type-Options: nosniff、Content-Type 是偵測出的型別', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '下載' } })).body.id
    const name = '會議 截圖.png'
    const form = new FormData()
    form.append('file', new Blob([PNG], { type: 'text/html' }), name)
    const up = await call(t, 'POST', `/api/v1/projects/${p}/files`, { token: a.token, raw: form })
    expect(up.status, up.text.slice(0, 200)).toBe(201)
    expect(up.body.filename, '中文檔名要照原樣存（multer 預設用 latin1 解檔名，要設 defParamCharset: "utf8"）').toBe(name)
    const res = await fetch(`${t.api}/api/v1/files/${up.body.id}/content`, { headers: { authorization: `Bearer ${a.token}` } })
    expect(res.status).toBe(200)
    const cd = res.headers.get('content-disposition') ?? ''
    expect(cd, 'Content-Disposition 要以 attachment 開頭：inline 會讓瀏覽器直接在你的網域打開檔案').toMatch(/^attachment\b/i)
    expect(cd, `中文檔名要用 RFC 6266 的 filename*=UTF-8''<百分比編碼>，實際：${cd}`).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`)
    expect(res.headers.get('x-content-type-options'), '要有 X-Content-Type-Options: nosniff').toBe('nosniff')
    expect(res.headers.get('content-type') ?? '', 'Content-Type 要用偵測出來的 image/png，不是上傳時瀏覽器送的 text/html').toMatch(/^image\/png/)
  })
})
