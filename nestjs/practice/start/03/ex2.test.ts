// 練習 2：快樂時光。PricingService 透過 CLOCK（Symbol token）取得現在時間
import { afterAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'

// 先把這個程序的時區換成洛杉磯，再載入你的程式：用 getHours()、或沒指定 timeZone 的 Intl.DateTimeFormat
// （用的都是伺服器所在地的時區）會算錯。所以下面用 await import()，不用一般的 import（一般的 import 會先執行）
const tz = process.env.TZ
process.env.TZ = 'America/Los_Angeles'
const { AppModule } = await import('./src/app.module.js')
const { PricingService } = await import('./src/pricing.service.js')
const { CLOCK } = await import('./src/clock.js')

const latte = { id: 2, name: '拿鐵', price: 110, category: 'coffee' as const }
const tea = { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' as const }
const croissant = { id: 5, name: '可頌', price: 70, category: 'food' as const }

let now = new Date('2026-11-02T15:00:00+08:00')
const clock = { now: () => now }
const apps: INestApplication[] = []

afterAll(async () => {
  if (tz === undefined) delete process.env.TZ
  else process.env.TZ = tz
  await Promise.all(apps.map(a => a.close()))
})

async function pricing() {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue(clock).compile()
  return ref.get(PricingService)
}

describe('練習 2：快樂時光', () => {
  it.each([
    ['13:59:59', 110, '還沒到 14:00，原價'],
    ['14:00:00', 88, '14:00 整開始打八折'],
    ['15:59:59', 88, '16:00 之前都打八折'],
    ['16:00:00', 110, '16:00 整就結束（不含 16:00）'],
  ])('台北時間 %s 拿鐵 %i 元', async (time, expected, why) => {
    const s = await pricing()
    now = new Date(`2026-11-02T${time}+08:00`)
    expect(s.priceOf(latte), `${why}。PricingService 要用 @Inject(CLOCK) 注入的 clock.now()，不要自己 new Date()；小時要用 Asia/Taipei 時區算，不是 getHours()／getUTCHours()`).toBe(expected)
  })

  it('茶也打折，食物不打折', async () => {
    const s = await pricing()
    now = new Date('2026-11-02T14:30:00+08:00')
    expect(s.priceOf(tea), '伯爵紅茶（tea）14:30 要打八折：72').toBe(72)
    expect(s.priceOf(croissant), '可頌（food）不打折：70').toBe(70)
  })

  it('換一天、跨過 UTC 的午夜也一樣（台北 00:30 是 UTC 前一天 16:30）', async () => {
    const s = await pricing()
    now = new Date('2026-11-03T00:30:00+08:00')
    expect(s.priceOf(latte), '台北 00:30 不是快樂時光：用 getUTCHours() 會拿到 16 而打錯折').toBe(110)
    now = new Date('2026-11-03T14:10:00+08:00')
    expect(s.priceOf(latte), '台北 14:10 要打折').toBe(88)
  })

  it('GET /products/2/price 用注入的時鐘', async () => {
    now = new Date('2026-11-02T15:00:00+08:00')
    const app = await createTestApp(AppModule, { override: b => b.overrideProvider(CLOCK).useValue(clock) })
    apps.push(app)
    const res = await request(app.getHttpServer()).get('/products/2/price')
    expect(res.body, 'GET /products/2/price 在 15:00 要回 { id: 2, price: 88 }').toEqual({ id: 2, price: 88 })
  })

  it('AppModule 用 useValue 提供真正的時鐘', async () => {
    const app = await createTestApp(AppModule)
    apps.push(app)
    let real: { now?: () => Date } | undefined
    try { real = app.get(CLOCK, { strict: false }) } catch {}
    expect(typeof real?.now, 'AppModule 的 providers 要有 { provide: CLOCK, useValue: { now: () => new Date() } }').toBe('function')
    expect(Math.abs(real!.now().getTime() - Date.now()), '真正的時鐘 now() 要回傳現在的時間').toBeLessThan(5000)
    const res = await request(app.getHttpServer()).get('/products/1/price')
    expect(res.status, '沒有替換任何東西時 GET /products/1/price 也要能用').toBe(200)
    expect([80, 64], '美式咖啡不是 80 就是快樂時光的 64').toContain(res.body.price)
  })
})
