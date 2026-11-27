// 練習 2：GET /products/featured 被 GET /products/:id 擋住。用預設的路由比對方式（宣告順序）建應用
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js'
import { RequestMethod } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { ProductsController } from './src/products.controller.js'

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule) })
afterAll(() => app?.close())

// Nest 照 class 裡方法的宣告順序登記路由：列出 GET 路由的路徑
const getRoutes = () => {
  const proto = ProductsController.prototype as unknown as Record<string, unknown>
  return Object.getOwnPropertyNames(proto)
    .filter(name => typeof proto[name] === 'function' && Reflect.getMetadata(METHOD_METADATA, proto[name] as object) === RequestMethod.GET)
    .map(name => Reflect.getMetadata(PATH_METADATA, proto[name] as object) as string)
}

describe('練習 2：修好路由遮蔽', () => {
  it('GET /products/featured 回拿鐵和起司蛋糕', async () => {
    const res = await http('/products/featured')
    expect(res.status, '網址要維持 /products/featured，回 200。回 400 或 { id: \'featured\' } 表示請求被 :id 那支攔走了').toBe(200)
    expect(res.body.map((p: { name: string }) => p.name), '要回本週推薦：拿鐵、起司蛋糕').toEqual(['拿鐵', '起司蛋糕'])
  })

  it('GET /products/2 仍然回拿鐵', async () => {
    const res = await http('/products/2')
    expect(res.status, 'GET /products/:id 不能被改壞').toBe(200)
    expect(res.body.name, 'GET /products/2 要回拿鐵').toBe('拿鐵')
  })

  it('featured 的方法宣告在 :id 的方法前面', () => {
    const routes = getRoutes()
    expect(routes, '找不到 @Get(\'featured\')：網址不能改').toContain('featured')
    expect(routes.indexOf('featured'), '把 @Get(\'featured\') 整個方法搬到 @Get(\':id\') 前面。在 findOne 裡判斷 id === \'featured\'、或只在 main.ts 開 routeResolutionStrategy 都不算：別的應用（例如測試）用預設設定就又壞了').toBeLessThan(routes.indexOf(':id'))
  })
})

function http(path: string) {
  return request(app.getHttpServer()).get(path)
}
