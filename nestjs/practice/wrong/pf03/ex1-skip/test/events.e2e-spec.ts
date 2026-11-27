import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

let app: INestApplication
const http = () => request(app.getHttpServer())
const future = (days = 7) => new Date(Date.now() + days * 86_400_000).toISOString()
const newEvent = async (capacity = 3) => (await http().post('/api/v1/events').send({ title: '讀書會', startsAt: future(), capacity }).expect(201)).body

beforeAll(async () => {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = ref.createNestApplication({ logger: false })
  configureApp(app)   // 跟 main.ts 同一套設定
  await app.init()
})
beforeEach(async () => {
  await app.get(PrismaService).$executeRawUnsafe('TRUNCATE registrations, events')
})
afterAll(() => app?.close())

describe('活動', () => {
  it('建立活動：remaining 等於 capacity', async () => {
    const e = await newEvent(5)
    expect(e).toMatchObject({ title: '讀書會', capacity: 5, remaining: 5 })
  })

  it('VALIDATION_FAILED：名額超過 500、過去的時間、多餘欄位', async () => {
    for (const body of [
      { title: 'x', startsAt: future(), capacity: 501 },
      { title: 'x', startsAt: '2020-01-01T00:00:00Z', capacity: 3 },
      { title: 'x', startsAt: future(), capacity: 3, remaining: 99 },
    ]) {
      const res = await http().post('/api/v1/events').send(body).expect(400)
      expect(res.body.errorCode).toBe('VALIDATION_FAILED')
      expect(res.body.requestId).toBeTruthy()
    }
  })

  it('EVENT_NOT_FOUND：不存在的活動', async () => {
    const res = await http().get('/api/v1/events/00000000-0000-4000-8000-000000000000').expect(404)
    expect(res.body.errorCode).toBe('EVENT_NOT_FOUND')
  })

  it('游標分頁：走完所有活動，不重複也不漏', async () => {
    for (let i = 0; i < 25; i++) await newEvent()
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const res: request.Response = await http().get('/api/v1/events').query(cursor ? { cursor } : {}).expect(200)
      seen.push(...res.body.items.map((e: { id: string }) => e.id))
      cursor = res.body.nextCursor
    } while (cursor)
    expect(seen.length).toBe(25)
    expect(new Set(seen).size).toBe(25)
  })
})

describe('報名', () => {
  it('報名成功扣一個名額，取消後還回去', async () => {
    const e = await newEvent(2)
    const r = await http().post(`/api/v1/events/${e.id}/registrations`).send({ email: 'ann@example.com', name: 'Ann' }).expect(201)
    expect((await http().get(`/api/v1/events/${e.id}`)).body.remaining).toBe(1)
    await http().delete(`/api/v1/events/${e.id}/registrations/${r.body.id}`).expect(204)
    expect((await http().get(`/api/v1/events/${e.id}`)).body.remaining).toBe(2)
  })

  it('ALREADY_REGISTERED：同一個 email 換大小寫也算重複，而且不會多扣名額', async () => {
    const e = await newEvent(3)
    await http().post(`/api/v1/events/${e.id}/registrations`).send({ email: 'ann@example.com', name: 'Ann' }).expect(201)
    const res = await http().post(`/api/v1/events/${e.id}/registrations`).send({ email: 'ANN@Example.com', name: 'Ann' }).expect(409)
    expect(res.body.errorCode).toBe('ALREADY_REGISTERED')
    expect((await http().get(`/api/v1/events/${e.id}`)).body.remaining).toBe(2)
  })

  it('EVENT_FULL：同時 10 個人搶 3 個名額，恰好 3 個成功', async () => {
    const e = await newEvent(3)
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      http().post(`/api/v1/events/${e.id}/registrations`).send({ email: `u${i}@example.com`, name: `U${i}` })))
    expect(results.filter(r => r.status === 201).length).toBe(3)
    expect(results.filter(r => r.status === 409 && r.body.errorCode === 'EVENT_FULL').length).toBe(7)
    expect((await http().get(`/api/v1/events/${e.id}`)).body.remaining).toBe(0)
  })

  it.skip('REGISTRATION_NOT_FOUND：取消不存在的報名', async () => {
    const e = await newEvent()
    const res = await http().delete(`/api/v1/events/${e.id}/registrations/00000000-0000-4000-8000-000000000000`).expect(404)
    expect(res.body.errorCode).toBe('REGISTRATION_NOT_FOUND')
  })
})
