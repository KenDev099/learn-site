import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'

// 跨租戶測試（第 18 課）：每加一個有 :id 的端點，就在 ENDPOINTS 加一列
let app: INestApplication
const http = () => request(app.getHttpServer())
const signup = async () => {
  const email = `e2e-${randomUUID()}@example.test`
  await http().post('/api/v1/auth/signup').send({ email, password: 'e2e-password-1', name: 'E2E', tenantName: 'T' }).expect(201)
  const res = await http().post('/api/v1/auth/login').send({ email, password: 'e2e-password-1' }).expect(200)
  return { authorization: `Bearer ${res.body.accessToken}` }
}

beforeAll(async () => {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = ref.createNestApplication({ logger: false, bodyParser: false })
  configureApp(app)
  await app.init()
})
afterAll(() => app?.close())

const ENDPOINTS = [
  { create: '/api/v1/projects', item: '/api/v1/projects/:id', body: { name: 'p' } },
  { create: '/api/v1/tags', item: '/api/v1/tags/:id', body: { name: 't' } },
]

describe('別的租戶的資料一律 404', () => {
  for (const e of ENDPOINTS) {
    it(e.item, async () => {
      const a = await signup(), b = await signup()
      const { body } = await http().post(e.create).set(a).send(e.body).expect(201)
      const path = e.item.replace(':id', body.id)
      await http().get(path).set(b).expect(404)
      await http().patch(path).set(b).send(e.body).expect(404)
      await http().delete(path).set(b).expect(404)
      await http().get(path).set(a).expect(200)
    })
  }
})
