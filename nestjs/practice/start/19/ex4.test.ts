// 練習 4：Redis 壞掉時 API 仍然可用
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Logger, type INestApplication } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { PrismaClient } = await import('./src/generated/prisma/client.js')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// 假的快取：mode 決定它怎麼壞
let mode: 'reject' | 'hang' = 'reject'
const broken = () => mode === 'reject' ? Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:6380')) : new Promise<never>(() => {})
const calls: string[] = []
const fakeCache = {
  get: (key: string) => { calls.push(`get ${key}`); return broken() },
  set: (key: string) => { calls.push(`set ${key}`); return broken() },
  del: (key: string) => { calls.push(`del ${key}`); return broken() },
  mget: () => broken(), mset: () => broken(), mdel: (keys: string[]) => { calls.push(`mdel ${keys}`); return broken() },
  ttl: () => broken(), clear: () => broken(), wrap: () => broken(),
  on: () => {}, off: () => {}, disconnect: async () => {},
}

let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma).overrideProvider(CACHE_MANAGER).useValue(fakeCache) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
})
beforeEach(async () => {
  calls.length = 0
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO products (name, price, category) VALUES ('美式咖啡', 80, 'coffee'), ('伯爵紅茶', 90, 'tea')`)
})
afterEach(() => { vi.restoreAllMocks() })

const spyWarn = () => {
  const proto = vi.spyOn(Logger.prototype, 'warn')
  const stat = vi.spyOn(Logger, 'warn')
  return () => proto.mock.calls.length + stat.mock.calls.length
}

describe('練習 4：快取壞掉不能拖垮 API', () => {
  it('Redis 回錯誤：GET /menu 仍然回 200（資料來自資料庫），並記一筆 warn', async () => {
    mode = 'reject'
    const warns = spyWarn()
    const res = await request(app.getHttpServer()).get('/menu')
    expect(res.status, `Redis 出錯時 GET /menu 回了 ${res.status}：cache.get／cache.set 的錯誤要自己 try/catch，失敗就當作沒命中、直接用資料庫`).toBe(200)
    expect(res.body.map((p: { name: string }) => p.name), '回傳的是資料庫裡的菜單').toEqual(['美式咖啡', '伯爵紅茶'])
    expect(calls.some(c => c.startsWith('get ')), 'MenuService 要先用注入的 CACHE_MANAGER 讀快取（@Inject(CACHE_MANAGER)）').toBe(true)
    expect(warns(), '快取出錯時要用 Logger 的 warn 記下來：默默吞掉錯誤，Redis 壞了一個禮拜也沒人知道').toBeGreaterThan(0)
  })

  it('Redis 沒有回應（卡住）：GET /menu 不能跟著卡住，200 毫秒左右就改用資料庫', async () => {
    mode = 'hang'
    const warns = spyWarn()
    const started = Date.now()
    const res = await request(app.getHttpServer()).get('/menu').timeout(2_000).catch(e => e)
    const elapsed = Date.now() - started
    expect(res.status, `Redis 不回應時 GET /menu 等了 ${elapsed} 毫秒還沒有結果：await 一個不會結束的 Promise，請求就永遠卡住。讀取和寫入快取都要有逾時（Promise.race 加一個 200 毫秒後 reject 的 Promise）`).toBe(200)
    expect(elapsed, `花了 ${elapsed} 毫秒：快取的逾時抓 200 毫秒左右（讀和寫各一次，加起來不到 1 秒）`).toBeLessThan(1_000)
    expect(res.body.length, '回傳資料庫裡的菜單').toBe(2)
    expect(warns(), '逾時也要記 warn').toBeGreaterThan(0)
  })

  it('Redis 沒有回應（卡住）：PATCH 改價也不能跟著卡住', async () => {
    mode = 'hang'
    const warns = spyWarn()
    const started = Date.now()
    const res = await request(app.getHttpServer()).patch('/products/1').send({ price: 85 }).timeout(2_000).catch(e => e)
    const elapsed = Date.now() - started
    expect(res.status, `Redis 不回應時 PATCH /products/1 等了 ${elapsed} 毫秒還沒有結果：刪快取（del／mdel）也要有逾時`).toBe(200)
    expect(elapsed, `花了 ${elapsed} 毫秒：刪快取的逾時也抓 200 毫秒左右`).toBeLessThan(1_000)
    expect(warns(), '刪快取逾時也要記 warn').toBeGreaterThan(0)
  })

  it('Redis 壞掉時改價仍然成功（刪快取失敗只記 warn）', async () => {
    mode = 'reject'
    const warns = spyWarn()
    const res = await request(app.getHttpServer()).patch('/products/1').send({ price: 85 })
    expect(res.status, `Redis 出錯時 PATCH /products/1 回了 ${res.status}：資料庫已經改好了，刪快取失敗不該讓請求失敗（記 warn，靠 TTL 收尾）`).toBe(200)
    expect(warns(), '刪快取失敗要記 warn').toBeGreaterThan(0)
  })
})
