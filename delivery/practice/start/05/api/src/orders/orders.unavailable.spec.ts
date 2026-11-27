// BUG-31 的回歸測試：重現「購物車裡有下架商品」，修好之後它要通過，以後有人改壞它會再失敗
// 執行：在專案根目錄 npm test（用 api/.env 的資料庫；種子資料裡 7 號桂花烏龍是下架的）
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../app.module.js'

let app: INestApplication

beforeAll(async () => {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = ref.createNestApplication({ logger: false })
  await app.init()
})
afterAll(() => app.close())

describe('BUG-31 購物車裡有下架商品', () => {
  // TODO：把 it.todo 換成 it(名稱, async () => { … })：送出含 7 號商品的訂單，斷言 409、code 與 details.productIds
  it.todo('TODO')
})
