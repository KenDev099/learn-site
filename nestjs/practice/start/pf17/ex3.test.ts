// 練習 3（選做）：部署後的冒煙測試。work/portfolio.json 的 saas.deployUrl 填上 https 網址才會跑
import { call, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
// 出題檢查沒有部署：對參考實作本身跑同一組冒煙（跳過 https 的檢查）
const url = t.verify ? t.api : t.deployUrl?.replace(/\/+$/, '')
if (!url) throw new Error('選做：還沒部署。部署好之後在 work/portfolio.json 的 saas 區段加 "deployUrl": "https://你的網址"，再執行一次（不影響其他練習）')
const d = { ...t, api: url }

describe('練習 3（選做）：部署後的冒煙測試', () => {
  it('網址是 https，回應有 Strict-Transport-Security', async () => {
    const r = await call(d, 'GET', '/health/live')
    expect(r.status, `${url}/health/live 要 200`).toBe(200)
    if (!t.verify) expect(url, 'deployUrl 要是 https：token 與密碼不能用明文傳').toMatch(/^https:\/\//)
    expect(r.headers.get('strict-transport-security'), '回應要有 Strict-Transport-Security（helmet 預設會加）：瀏覽器之後一律用 https 連這個網域').toMatch(/max-age=\d+/)
  })

  it('/health/ready 200（資料庫與 Redis 都連得上）', async () => {
    const r = await call(d, 'GET', '/health/ready')
    expect(r.status, `${url}/health/ready 要 200：${r.text.slice(0, 200)}`).toBe(200)
  })

  it('註冊、登入、建立 project；別的租戶讀不到', async () => {
    const a = await signupTenant(d), b = await signupTenant(d)
    const p = await call(d, 'POST', '/api/v1/projects', { token: a.token, body: { name: '冒煙測試' } })
    expect(p.status, `建立 project 要 201：${p.text.slice(0, 200)}`).toBe(201)
    expect((await call(d, 'GET', `/api/v1/projects/${p.body.id}`, { token: a.token })).status, '自己讀得到').toBe(200)
    expectError(await call(d, 'GET', `/api/v1/projects/${p.body.id}`, { token: b.token }), 404, 'NOT_FOUND', '別的租戶讀 ')
  })
})
