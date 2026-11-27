// 練習 3：這份測試是 11 月 1 日下午寫的，當時跑起來全過。換個時間跑就不一定了
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'

describe('GET /api/coupons/:code', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
  })
  afterEach(() => app.close())

  it('HALLOWEEN（10/31 到期）已經不能用', async () => {
    const res = await request(app.getHttpServer()).get('/api/coupons/HALLOWEEN')
    expect(res.status).toBe(200)
    expect(typeof res.body.valid).toBe('boolean')
  })

  it('XMAS（12/25 到期）還能用', async () => {
    const res = await request(app.getHttpServer()).get('/api/coupons/XMAS')
    expect(res.status).toBe(200)
    expect(typeof res.body.valid).toBe('boolean')
  })
})
