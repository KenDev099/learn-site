// 練習 1：CreateOrderDto 與全域 ValidationPipe
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { OrdersService } from './src/orders/orders.service.js'
import { CreateOrderDto, OrderItemDto } from './src/orders/create-order.dto.js'

const item = (over: Record<string, unknown> = {}) => ({ productId: 2, qty: 2, size: 'M', ...over })
const order = (over: Record<string, unknown> = {}) => ({ customerId: 1, items: [item(), item({ productId: 6, qty: 1, size: 'S' })], ...over })
const PIPE_HINT = '確認 AppModule 的 providers 有 { provide: APP_PIPE, useValue: new ValidationPipe({ … }) }（只寫在 main.ts 的 useGlobalPipes，測試建立的應用看不到），而且 DTO 欄位有 class-validator 的規則'

describe('練習 1：POST /orders 的驗證', () => {
  let app: INestApplication
  const create = vi.fn((dto: object) => ({ id: 1, status: 'pending', ...dto }))
  beforeAll(async () => {
    app = await createTestApp(AppModule, { override: b => b.overrideProvider(OrdersService).useValue({ create, list: () => ({}) }) })
  })
  afterAll(() => app?.close())
  const post = (body: object) => request(app.getHttpServer()).post('/orders').send(body)

  it('合法的訂單回 201，handler 拿到的是 DTO 的實例', async () => {
    const res = await post(order({ note: '少冰' }))
    expect(res.status, '合法的訂單要回 201').toBe(201)
    expect(create, 'OrdersService.create 要被呼叫一次').toHaveBeenCalledTimes(1)
    const dto = create.mock.calls[0][0] as CreateOrderDto
    expect(dto, 'handler 拿到的要是 CreateOrderDto 的實例：ValidationPipe 要開 transform: true').toBeInstanceOf(CreateOrderDto)
    expect(dto.items[0], 'items 的每一筆要變成 OrderItemDto 的實例：items 要加 @Type(() => OrderItemDto)').toBeInstanceOf(OrderItemDto)
    expect(dto.items[0].qty, 'qty 要是數字 2').toBe(2)
    expect(dto.note).toBe('少冰')
  })

  it('沒有 note 也可以；note 剛好 50 字可以', async () => {
    expect((await post(order())).status, 'note 是選填：沒給也要 201（@IsOptional()）').toBe(201)
    expect((await post(order({ note: '冰'.repeat(50) }))).status, 'note 50 字以內要 201').toBe(201)
  })

  it('客戶端多塞 price、status → 400，而且 service 沒被呼叫', async () => {
    const res = await post(order({ price: 0, status: 'paid' }))
    expect(res.status, `多出來的欄位要回 400：ValidationPipe 要開 whitelist 與 forbidNonWhitelisted。${PIPE_HINT}`).toBe(400)
    expect(create, '驗證沒過時 handler 不該執行').not.toHaveBeenCalled()
    expect(Object.keys(res.body.message ?? {}), "錯誤要依欄位分組：ValidationPipe 加上 errorFormat: 'grouped'").toContain('price')
  })

  it('items 裡的錯誤會被找到，錯誤的 key 是 items.1.qty', async () => {
    const res = await post(order({ items: [item(), item({ qty: 0 })] }))
    expect(res.status, 'items[1].qty 是 0 要回 400：巢狀物件要加 @ValidateNested({ each: true }) 與 @Type(() => OrderItemDto)，OrderItemDto 的 qty 要 @Min(1)').toBe(400)
    expect(res.body.message, "錯誤格式要是 errorFormat: 'grouped'，而且要有 'items.1.qty' 這個 key").toHaveProperty(['items.1.qty'])
  })

  it('每一筆 item 的規則：productId 正整數、qty 1–10、size 只能 S/M/L、不能有多的欄位', async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ productId: -1 }, 'productId 是 -1'],
      [{ productId: 1.5 }, 'productId 是 1.5'],
      [{ qty: 11 }, 'qty 是 11'],
      [{ qty: '2' }, "qty 是字串 '2'（JSON body 裡的數字本來就是數字，不要隱含轉換）"],
      [{ size: 'XL' }, "size 是 'XL'"],
      [{ price: 0 }, 'item 裡多了 price'],
    ]
    for (const [over, why] of bad) {
      expect((await post(order({ items: [item(over)] }))).status, `${why} 要回 400`).toBe(400)
    }
    expect(create, '驗證沒過時 handler 不該執行').not.toHaveBeenCalled()
  })

  it('customerId 正整數、items 1–20 筆、note 最多 50 字', async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ customerId: 0 }, 'customerId 是 0'],
      [{ customerId: '1' }, "customerId 是字串 '1'"],
      [{ customerId: undefined }, '沒有 customerId'],
      [{ items: [] }, 'items 是空陣列（@ArrayMinSize(1)）'],
      [{ items: Array.from({ length: 21 }, () => item()) }, 'items 有 21 筆（@ArrayMaxSize(20)）'],
      [{ items: undefined }, '沒有 items'],
      [{ note: '冰'.repeat(51) }, 'note 有 51 字'],
      [{ note: 5 }, 'note 是數字'],
    ]
    for (const [over, why] of bad) {
      expect((await post(order(over))).status, `${why} 要回 400`).toBe(400)
    }
    expect((await post(order({ items: Array.from({ length: 20 }, () => item()) }))).status, 'items 剛好 20 筆要 201').toBe(201)
  })
})
