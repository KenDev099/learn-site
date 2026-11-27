// 練習 1：上傳、metadata、下載的位元組跟原檔一樣
import { call, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
// 1×1 的 PNG；第二個檔案在後面多接幾個 byte，內容不同、開頭一樣是 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
const PNG2 = Buffer.concat([PNG, Buffer.from('second file')])

function upload(acc: Account, projectId: string, data: Buffer, filename: string, type = 'image/png') {
  const form = new FormData()
  form.append('file', new Blob([data], { type }), filename)
  return call(t, 'POST', `/api/v1/projects/${projectId}/files`, { token: acc.token, raw: form })
}
// 跟著 302 走（存在物件儲存、回 presigned URL 的寫法也算）
async function download(acc: Account, id: string) {
  const res = await fetch(`${t.api}/api/v1/files/${id}/content`, { headers: { authorization: `Bearer ${acc.token}` } })
  expect(res.status, `GET /api/v1/files/${id}/content 要 200（或 302 到儲存的網址）`).toBe(200)
  return Buffer.from(await res.arrayBuffer())
}

describe('練習 1：上傳與下載', () => {
  it('上傳 PNG 201，metadata 正確；GET /files/:id 一樣', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '檔案' } })).body.id
    const up = await upload(a, p, PNG, 'logo.png')
    expect(up.status, `上傳要 201：${up.text.slice(0, 200)}`).toBe(201)
    expect(up.body, '回應要有 id、projectId、filename、contentType、size、createdAt').toMatchObject({ projectId: p, filename: 'logo.png', contentType: 'image/png', size: PNG.length })
    expect(typeof up.body.id).toBe('string')
    const meta = await call(t, 'GET', `/api/v1/files/${up.body.id}`, { token: a.token })
    expect(meta.status).toBe(200)
    expect(meta.body).toMatchObject({ id: up.body.id, projectId: p, filename: 'logo.png', contentType: 'image/png', size: PNG.length })
    expect((await download(a, up.body.id)).equals(PNG), '下載的位元組要跟上傳的一樣').toBe(true)
  })

  it('兩個檔名一樣的檔案各自保存，不會互相覆蓋（儲存的 key 不用使用者的檔名）', async () => {
    const a = await signupTenant(t)
    const p = (await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '同名' } })).body.id
    const first = await upload(a, p, PNG, 'logo.png')
    const second = await upload(a, p, PNG2, 'logo.png')
    expect([first.status, second.status]).toEqual([201, 201])
    expect(first.body.id).not.toBe(second.body.id)
    expect((await download(a, first.body.id)).equals(PNG), '第一個檔案的內容被第二個蓋掉了：key 要用程式產生的隨機 ID（tenants/<tenantId>/files/<id>），不要用檔名').toBe(true)
    expect((await download(a, second.body.id)).equals(PNG2)).toBe(true)
  })
})
