// 練習 2：UpdateProductDto 與 PATCH /products/:id
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { UpdateProductDto } from './src/products/update-product.dto.js'

describe('練習 2：PATCH /products/:id 只改有傳的欄位', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())
  const patch = (id: number | string, body: object) => request(app.getHttpServer()).patch(`/products/${id}`).send(body)
  const get = async (id: number) => (await request(app.getHttpServer()).get(`/products/${id}`)).body

  it('UpdateProductDto 是用 PartialType(CreateProductDto) 產生的', () => {
    expect(Object.getPrototypeOf(UpdateProductDto).name, '不要手寫一份規則：寫成 export class UpdateProductDto extends PartialType(CreateProductDto, { … }) {}，規則才會跟著 CreateProductDto').toBe('PartialCreateProductDto')
  })

  it('只傳 price：price 改了，name 不變', async () => {
    const res = await patch(2, { price: 120 })
    expect(res.status, 'PATCH { price: 120 } 要回 200：UpdateProductDto 要用 PartialType(CreateProductDto)，讓每個欄位都有驗證規則又是選填').toBe(200)
    expect(await get(2), '只傳 price 時 name 要維持「拿鐵」').toEqual({ id: 2, name: '拿鐵', price: 120 })
  })

  it('只傳 name：name 改了，price 不變', async () => {
    expect((await patch(4, { name: '冰伯爵紅茶' })).status, 'PATCH { name } 要回 200').toBe(200)
    expect(await get(4), '只傳 name 時 price 要維持 90').toEqual({ id: 4, name: '冰伯爵紅茶', price: 90 })
  })

  it('name 是空字串 → 400', async () => {
    expect((await patch(1, { name: '' })).status, "name: '' 要回 400：PartialType 會沿用 CreateProductDto 的 @IsNotEmpty()").toBe(400)
  })

  it('name 是 null → 400，而且原本的名稱沒被清掉', async () => {
    const res = await patch(3, { name: null })
    expect(res.status, 'name: null 要回 400：PartialType 預設替每個欄位加 @IsOptional()，null 會跳過驗證。改成 PartialType(CreateProductDto, { skipNullProperties: false })').toBe(400)
    expect((await get(3)).name, 'name: null 不能把「卡布奇諾」清掉').toBe('卡布奇諾')
  })

  it('沿用 CreateProductDto 的規則：price 0、price 字串、多的欄位都回 400', async () => {
    expect((await patch(5, { price: 0 })).status, 'price: 0 要回 400（沿用 @Min(1)）').toBe(400)
    expect((await patch(5, { price: '70' })).status, "price: '70' 要回 400（沿用 @IsInt()）").toBe(400)
    expect((await patch(5, { unknown: 1 })).status, '多的欄位要回 400（forbidNonWhitelisted）').toBe(400)
    expect((await patch(5, { price: null })).status, 'price: null 也要回 400').toBe(400)
    expect((await patch(5, { price: 1001 })).status, 'price: 1001 要回 400（沿用 @Max(1000)）').toBe(400)
    expect((await patch(5, { name: '可'.repeat(31) })).status, 'name 31 字要回 400（沿用 @MaxLength(30)）').toBe(400)
    expect(await get(5), '驗證沒過的請求都不能改到資料').toEqual({ id: 5, name: '可頌', price: 70 })
  })

  it('id 不是數字 → 400（ParseIntPipe）', async () => {
    expect((await patch('abc', { price: 100 })).status, '/products/abc 要回 400：保留 @Param(\'id\', ParseIntPipe)').toBe(400)
  })
})
