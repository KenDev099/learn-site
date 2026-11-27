// 練習 4：/health/ready 檢查資料庫與 Redis
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：健康檢查', () => {
  it('GET /health/live 200（不查依賴）', async () => {
    expect((await call(t, 'GET', '/health/live')).status, 'GET /health/live 要 200').toBe(200)
  })

  it('GET /health/ready 200，details 列出 database 與 redis 都是 up', async () => {
    const r = await call(t, 'GET', '/health/ready')
    expect(r.status, `GET /health/ready 要 200：${r.text.slice(0, 200)}`).toBe(200)
    expect(r.body?.details?.database?.status, 'details.database.status 要是 "up"').toBe('up')
    expect(r.body?.details?.redis?.status, 'details.redis.status 要是 "up"：限流與佇列都靠 Redis，Redis 斷了這個副本就不該接流量。用 HealthIndicatorService 寫一個 ping Redis 的檢查加進 ready').toBe('up')
  })
})
