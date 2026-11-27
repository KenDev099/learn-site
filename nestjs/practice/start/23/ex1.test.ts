// 練習 1：/docs 提供 Swagger UI，/docs-json 的 OpenAPI 文件完整描述 POST /orders 的請求與成功回應
// 這裡跑在 Vitest（Oxc 轉譯）底下，Swagger CLI 外掛不會執行：欄位一定要用 @ApiProperty 寫出來
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'

type Schema = { type?: string, $ref?: string, properties?: Record<string, Schema>, required?: string[], items?: Schema, enum?: unknown[] }

describe('練習 1：OpenAPI 文件', () => {
  let app: INestApplication
  let doc: { openapi?: string, paths: Record<string, Record<string, any>>, components?: { schemas?: Record<string, Schema> } }
  beforeAll(async () => {
    app = await createTestApp(AppModule, { configure: configureApp })
    const res = await request(app.getHttpServer()).get('/docs-json')
    expect(res.status, "GET /docs-json 要 200：在 configureApp 裡用 SwaggerModule.setup('docs', app, …) 提供文件").toBe(200)
    doc = res.body
  })
  afterAll(() => app?.close())

  const schema = (name: string) => {
    const s = doc.components?.schemas?.[name]
    expect(s, `文件的 components.schemas 裡找不到 ${name}：它要出現在某個路由的 @Body 或回應裡`).toBeDefined()
    return s!
  }
  const ref = (s: Schema | undefined) => s?.$ref?.replace('#/components/schemas/', '')

  it('/docs 是 Swagger UI 網頁，文件有標題', async () => {
    const res = await request(app.getHttpServer()).get('/docs')
    expect(res.status, 'GET /docs 要 200（Swagger UI）').toBe(200)
    expect(res.headers['content-type'], '/docs 要是 HTML 網頁').toMatch(/text\/html/)
    expect(doc.openapi, '/docs-json 要是 OpenAPI 文件（有 openapi 版本欄位）').toMatch(/^3\./)
    expect((doc as any).info?.title, "用 DocumentBuilder().setTitle('咖啡店 API') 設定標題").toBe('咖啡店 API')
  })

  it('CreateOrderDto 與 OrderItemDto：欄位、型別、必填都在文件裡', () => {
    const post = doc.paths['/orders']?.post
    expect(post, '文件裡要有 POST /orders').toBeDefined()
    expect(ref(post.requestBody?.content?.['application/json']?.schema), 'POST /orders 的 body 要指向 CreateOrderDto').toBe('CreateOrderDto')

    const create = schema('CreateOrderDto')
    expect(Object.keys(create.properties ?? {}).sort(), 'CreateOrderDto 的 properties 是空的或少欄位：Vitest 裡沒有 CLI 外掛，每個欄位都要加 @ApiProperty／@ApiPropertyOptional').toEqual(['customerId', 'items', 'note'])
    expect([...(create.required ?? [])].sort(), 'customerId、items 必填；note 選填要用 @ApiPropertyOptional（或 required: false）').toEqual(['customerId', 'items'])
    expect(create.properties!.customerId.type, "customerId 是整數：@ApiProperty({ type: 'integer' })").toBe('integer')
    expect(create.properties!.items.type, 'items 是陣列：@ApiProperty({ type: [OrderItemDto] })').toBe('array')
    expect(ref(create.properties!.items.items), 'items 的元素要指向 OrderItemDto（type: [OrderItemDto]）').toBe('OrderItemDto')
    expect(create.properties!.note.type, 'note 是字串').toBe('string')

    const item = schema('OrderItemDto')
    expect(Object.keys(item.properties ?? {}).sort(), 'OrderItemDto 的每個欄位也要 @ApiProperty').toEqual(['productId', 'qty', 'size'])
    expect([...(item.required ?? [])].sort(), 'OrderItemDto 的三個欄位都必填').toEqual(['productId', 'qty', 'size'])
    expect(item.properties!.productId.type, "productId 是整數：type: 'integer'").toBe('integer')
    expect(item.properties!.qty.type, "qty 是整數：type: 'integer'").toBe('integer')
    expect([...(item.properties!.size.enum ?? [])].sort(), "size 只能是 S、M、L：@ApiProperty({ enum: ['S', 'M', 'L'] })").toEqual(['L', 'M', 'S'])
  })

  it('201 回應指向 OrderResponse，而且跟真的回應一致', async () => {
    const created = doc.paths['/orders']?.post?.responses?.['201']
    expect(created, 'POST /orders 要記錄 201：@ApiCreatedResponse({ type: OrderResponse })').toBeDefined()
    expect(ref(created.content?.['application/json']?.schema), '201 的內容要指向 OrderResponse').toBe('OrderResponse')
    const resp = schema('OrderResponse')
    expect(Object.keys(resp.properties ?? {}).sort(), 'OrderResponse 的每個欄位都要 @ApiProperty').toEqual(['customerId', 'id', 'status', 'total'])
    expect([...(resp.required ?? [])].sort(), 'OrderResponse 的欄位一定會有，都是必填').toEqual(['customerId', 'id', 'status', 'total'])

    // 文件說的跟程式做的要一樣：真的下一張單，回應的欄位要剛好是文件上那幾個
    const res = await request(app.getHttpServer()).post('/orders').send({ customerId: 1, items: [{ productId: 1, qty: 1, size: 'M' }] })
    expect(res.status, '下單要 201（不要改 OrdersService）').toBe(201)
    expect(Object.keys(res.body).sort(), '真的回應的欄位要跟文件的 OrderResponse 一樣').toEqual(Object.keys(resp.properties!).sort())
  })
})
