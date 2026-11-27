import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { CLOCK } from '../src/clock.js'

// 時間由測試決定，寫成帶 +08:00 的固定瞬間：哪一天、哪個時區的機器跑都一樣
async function appAt(iso: string) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK).useValue({ now: () => new Date(iso) })
    .compile()
  const app = moduleRef.createNestApplication({ logger: false })
  configureApp(app)
  await app.init()
  return app
}

describe('GET /api/coupons/:code', () => {
  let app: INestApplication | undefined
  afterEach(() => app?.close())

  it.each([
    ['2026-10-31T00:00:00+08:00', true],
    ['2026-10-31T23:59:59+08:00', true],    // 到期當天的最後一秒還能用
    ['2026-11-01T00:00:00+08:00', false],   // 台北過了午夜就不能用（這時 UTC 還是 10/31）
    ['2026-11-01T07:59:59+08:00', false],
  ])('HALLOWEEN 在 %s 的 valid 是 %s', async (iso, valid) => {
    app = await appAt(iso)

    const res = await request(app.getHttpServer()).get('/api/coupons/HALLOWEEN')

    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(valid)
  })
})
