// 練習 1：健康檢查打得通（啟動、連資料庫、回應整條路）
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small')

describe('練習 1：/health/live 與 /health/ready', () => {
  it('GET /health/live 回 200（不加 /api/v1 前綴）', async () => {
    const res = await call(t, 'GET', '/health/live')
    expect(res.status, `GET /health/live 要 200，實際 ${res.status}：路徑沒有 /api/v1，setGlobalPrefix 要排除 health/live`).toBe(200)
  })

  it('GET /health/ready 回 200，body 標示資料庫是 up', async () => {
    const res = await call(t, 'GET', '/health/ready')
    expect(res.status, `GET /health/ready 要 200，實際 ${res.status}：${res.text.slice(0, 200)}`).toBe(200)
    expect(res.body?.details?.database?.status, 'ready 的 body 要有 details.database.status = "up"（@nestjs/terminus 的格式，見 CONTRACT-small.md）').toBe('up')
  })
})
