// 練習 1：骨架打得通，錯誤回應從第一天就是契約的格式
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 1：健康檢查與錯誤格式', () => {
  it('GET /health/live 200、GET /health/ready 200 且資料庫是 up（不加 /api/v1 前綴）', async () => {
    const live = await call(t, 'GET', '/health/live')
    expect(live.status, `GET /health/live 要 200，實際 ${live.status}：setGlobalPrefix 要排除 health/live`).toBe(200)
    const ready = await call(t, 'GET', '/health/ready')
    expect(ready.status, `GET /health/ready 要 200，實際 ${ready.status}：${ready.text.slice(0, 200)}`).toBe(200)
    expect(ready.body?.details?.database?.status, 'ready 的 body 要有 details.database.status = "up"（@nestjs/terminus 的格式）').toBe('up')
  })

  for (const [what, method, path] of [['不存在的路徑', 'GET', '/api/v1/no-such-route'], ['不存在的方法', 'DELETE', '/health/live']] as const) {
    it(`${what}（${method} ${path}）回 404，body 是 { statusCode, errorCode: "NOT_FOUND", message, requestId }`, async () => {
      const res = await call(t, method, path)
      expect(res.status, `${method} ${path} 要 404，實際 ${res.status}`).toBe(404)
      expect(res.body?.errorCode, `錯誤回應要有 errorCode: "NOT_FOUND"，實際 body：${res.text.slice(0, 200)}。Nest 預設的格式是 { statusCode, message, error }，要用全域的 exception filter 改成契約的格式`).toBe('NOT_FOUND')
      expect(res.body?.statusCode, 'body 的 statusCode 要跟 HTTP 狀態碼一樣').toBe(404)
      expect(typeof res.body?.message, 'body 要有 message（給人看的字串）').toBe('string')
      const id = res.headers.get('x-request-id')
      expect(id, '每個回應都要有 x-request-id 標頭（中介軟體產生，見 CONTRACT-saas.md）').toBeTruthy()
      expect(res.body?.requestId, `body 的 requestId 要等於 x-request-id 標頭（${id}）：filter 從請求上下文取同一個值`).toBe(id)
    })
  }
})
