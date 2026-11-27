// 練習 2：用 applyDecorators 做 @ApiErrorResponses，並在 POST /orders 記錄 400 與 409
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { ApiErrorResponses } from './src/common/api-error-responses.js'

// 一個錯誤回應在文件裡長什麼樣：schema 指向 ErrorResponse，範例（example 或 examples）帶出 errorCode
function documented(responses: Record<string, any> | undefined, status: number) {
  const r = responses?.[String(status)]
  const json = r?.content?.['application/json']
  const examples = [json?.example, ...Object.values(json?.examples ?? {}).map((e: any) => e?.value)].filter(Boolean)
  return { exists: !!r, ref: json?.schema?.$ref as string | undefined, codes: examples.map((e: any) => e.errorCode) }
}

function check(responses: Record<string, any> | undefined, status: number, errorCode: string, where: string) {
  const d = documented(responses, status)
  expect(d.exists, `${where} 要記錄 ${status}`).toBe(true)
  expect(d.ref, `${where} 的 ${status} 要用 type: ErrorResponse（第 8 課的錯誤格式）`).toBe('#/components/schemas/ErrorResponse')
  expect(d.codes, `${where} 的 ${status} 要有範例，範例的 errorCode 是 ${errorCode}，前端才知道要判斷哪個代碼`).toContain(errorCode)
}

describe('練習 2：錯誤回應寫進文件', () => {
  let app: INestApplication
  let doc: OpenAPIObject
  beforeAll(async () => {
    app = await createTestApp(AppModule)
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().build())
  })
  afterAll(() => app?.close())

  it('POST /orders 記錄 201、400（VALIDATION_FAILED）、409（OUT_OF_STOCK）', () => {
    const responses = doc.paths['/orders']?.post?.responses
    expect(responses?.['201'], '練習 1 的 201 要留著').toBeDefined()
    check(responses, 400, 'VALIDATION_FAILED', 'POST /orders')
    check(responses, 409, 'OUT_OF_STOCK', 'POST /orders')
  })

  it('文件上的 errorCode 跟 API 真的回的一樣', async () => {
    const http = () => request(app.getHttpServer())
    const bad = await http().post('/orders').send({ customerId: 1 })
    expect(bad.status).toBe(400)
    expect(documented(doc.paths['/orders']?.post?.responses, 400).codes, '400 的範例 errorCode 要跟真的回應一樣').toContain(bad.body.errorCode)
    const out = await http().post('/orders').send({ customerId: 1, items: [{ productId: 6, qty: 3, size: 'M' }] })
    expect(out.status).toBe(409)
    expect(documented(doc.paths['/orders']?.post?.responses, 409).codes, '409 的範例 errorCode 要跟真的回應一樣').toContain(out.body.errorCode)
  })

  it('@ApiErrorResponses 對任何狀態碼、任何數量都有效（不是寫死 400／409）', async () => {
    @Controller('probe')
    class ProbeController {
      @Get()
      @ApiErrorResponses(
        { status: 404, errorCode: 'PRODUCT_NOT_FOUND', description: '找不到商品' },
        { status: 422, errorCode: 'CARD_EXPIRED', description: '集點卡過期' },
        { status: 429, errorCode: 'TOO_MANY_REQUESTS', description: '太頻繁' },
      )
      get() { return 'ok' }
    }
    @Module({ controllers: [ProbeController] })
    class ProbeModule {}
    const probe = await createTestApp(ProbeModule)
    try {
      const responses = SwaggerModule.createDocument(probe, new DocumentBuilder().build()).paths['/probe']?.get?.responses
      check(responses, 404, 'PRODUCT_NOT_FOUND', '@ApiErrorResponses(404, 422, 429)')
      check(responses, 422, 'CARD_EXPIRED', '@ApiErrorResponses(404, 422, 429)')
      check(responses, 429, 'TOO_MANY_REQUESTS', '@ApiErrorResponses(404, 422, 429)')
      expect(responses?.['422']?.description, 'description 要放進文件，讓人知道什麼情況會發生').toContain('集點卡過期')
    } finally {
      await probe.close()
    }
  })
})
