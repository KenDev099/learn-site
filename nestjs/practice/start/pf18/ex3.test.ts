// 練習 3：安全標頭、CORS 白名單、JSON body 上限
import { call, expectError, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const EVIL = 'https://evil.example'

describe('練習 3：標頭、CORS、body 上限', () => {
  it('安全標頭（helmet 的預設）：nosniff、不能被 iframe、沒有 X-Powered-By', async () => {
    for (const [what, r] of [['GET /health/live', await call(t, 'GET', '/health/live')], ['壞掉的 JSON（400）', await call(t, 'POST', '/api/v1/auth/login', { raw: '{', headers: { 'content-type': 'application/json' } })]] as const) {
      expect(r.headers.get('x-content-type-options'), `${what}：要有 X-Content-Type-Options: nosniff（app.use(helmet())，放在 body parser 之前，錯誤回應才也有）`).toBe('nosniff')
      const frame = r.headers.get('x-frame-options') ?? '', csp = r.headers.get('content-security-policy') ?? ''
      expect(/deny|sameorigin/i.test(frame) || /frame-ancestors/.test(csp), `${what}：要有 X-Frame-Options 或 CSP 的 frame-ancestors（防 clickjacking）`).toBe(true)
      expect(r.headers.get('x-powered-by'), `${what}：X-Powered-By 透露了框架（helmet 會拿掉）`).toBeNull()
    }
  })

  it('CORS：設定以外的 Origin 不會拿到 Access-Control-Allow-Origin（一般請求與預檢）', async () => {
    const r = await call(t, 'GET', '/health/live', { headers: { origin: EVIL } })
    expect(r.headers.get('access-control-allow-origin'), `Origin: ${EVIL} 拿到了 Access-Control-Allow-Origin: ${r.headers.get('access-control-allow-origin')}：enableCors 的 origin 用設定裡的白名單，不要用 true 或 '*'`).toBeNull()
    const pre = await call(t, 'OPTIONS', '/api/v1/projects', { headers: { origin: EVIL, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
    expect(pre.headers.get('access-control-allow-origin'), `預檢（OPTIONS）也不能允許 ${EVIL}`).toBeNull()
  })

  it('JSON body 超過 1 MB 回 413 PAYLOAD_TOO_LARGE', async () => {
    const big = JSON.stringify({ email: 'a@example.test', password: 'x'.repeat(1_100_000) })
    expectError(await call(t, 'POST', '/api/v1/auth/login', { raw: big, headers: { 'content-type': 'application/json' } }), 413, 'PAYLOAD_TOO_LARGE', '1.1 MB 的 JSON ')
  })
})
