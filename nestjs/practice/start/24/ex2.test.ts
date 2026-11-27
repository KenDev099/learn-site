// 練習 2：/health/live 與 /health/ready（Terminus 12）
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { RedisService } from './src/redis/redis.service.js'
import { createTestApp } from '../../helpers/app.ts'

let app: INestApplication
let prisma: PrismaService
let redis: RedisService
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(ReceiptsProcessor).useValue({}) })
  prisma = app.get(PrismaService)
  redis = app.get(RedisService)
  // 先把連線建好：機器忙的時候，第一次連線可能就超過 1 秒的逾時
  await prisma.$queryRawUnsafe('SELECT 1')
  await redis.client.ping()
})
afterAll(async () => {
  vi.restoreAllMocks()
  await app?.close()
})

const get = (path: string) => request(app.getHttpServer()).get(path)
const never = () => new Promise<never>(() => {})

describe('練習 2：健康檢查', () => {
  it('服務都正常：live 與 ready 都是 200，ready 列出 database 與 redis', async () => {
    const live = await get('/health/live')
    expect(live.status, 'GET /health/live 要 200：在 HealthController 加上 @Get(\'live\')，回傳 this.health.check([])').toBe(200)
    expect(live.body.status, "live 的回應要是 Terminus 的格式（status: 'ok'）").toBe('ok')
    let ready = await get('/health/ready')
    for (let i = 0; i < 3 && ready.status !== 200; i++) ready = await get('/health/ready')   // 機器忙時偶爾逾時，多試幾次
    expect(ready.status, `GET /health/ready 要 200，收到 ${ready.status}：${JSON.stringify(ready.body)}`).toBe(200)
    expect(ready.body.details?.database?.status, "ready 要檢查資料庫，key 叫 'database'：PrismaHealthIndicator.pingCheck('database', this.prisma)").toBe('up')
    expect(ready.body.details?.redis?.status, "ready 要檢查 Redis，key 叫 'redis'：用 HealthIndicatorService 寫的 RedisHealthIndicator").toBe('up')
  })

  it('資料庫掛了：ready 是 503、database 是 down；live 還是 200', async () => {
    const fail = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5433'))
    const spies = [vi.spyOn(prisma, '$queryRawUnsafe').mockImplementation(fail as never)]
    try {
      const ready = await get('/health/ready')
      expect(ready.status, '資料庫連不上時 ready 要 503（不能接流量）').toBe(503)
      expect(ready.body.details?.database?.status, 'details.database.status 要是 down：PrismaHealthIndicator 要用注入的 PrismaService').toBe('down')
      expect(ready.body.details?.redis?.status, 'Redis 沒壞，details.redis.status 還是 up').toBe('up')
      const live = await get('/health/live')
      expect(live.status, 'live 不能檢查資料庫：資料庫一掛，所有執行個體都被判定死掉、一起重啟，問題反而擴大').toBe(200)
    } finally {
      spies.forEach(s => s.mockRestore())
    }
  })

  it('Redis 卡住不回應：ready 在 1 秒左右回 503，不會跟著卡住', { timeout: 40_000 }, async () => {
    const spy = vi.spyOn(redis.client, 'ping').mockImplementation(never as never)
    try {
      const started = Date.now()
      const ready = await get('/health/ready').timeout(15_000)
      const ms = Date.now() - started
      expect(ready.status, 'Redis 沒回應時 ready 要 503').toBe(503)
      expect(ready.body.details?.redis?.status, 'details.redis.status 要是 down：在 this.redis.client.ping() 失敗或逾時時').toBe('down')
      expect(ms, `ready 花了 ${ms} ms：Redis 的檢查要加 .withTimeout(1000)，不然一個卡住的依賴會讓健康檢查一起卡住`).toBeLessThan(8000)
      expect(spy, 'Redis 的檢查要呼叫注入的 RedisService 的 client.ping()').toHaveBeenCalled()
      const live = await get('/health/live').timeout(8000)
      expect(live.status, 'live 不能檢查 Redis').toBe(200)
    } finally {
      spy.mockRestore()
    }
  })
})
