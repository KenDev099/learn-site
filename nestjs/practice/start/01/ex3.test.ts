// 練習 3：nest g 產生 MenuService、MenuController，菜單資料放在 service，controller 用建構子注入
import { afterAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { AppController } from './src/app.controller.js'
import { AppService } from './src/app.service.js'

const service = await import('./src/menu.service.js').catch(() => undefined)
const controller = await import('./src/menu.controller.js').catch(() => undefined)
const apps: INestApplication[] = []
afterAll(() => Promise.all(apps.map(a => a.close())))

const drinks = [
  { name: '美式咖啡', price: 80 },
  { name: '拿鐵', price: 110 },
  { name: '卡布奇諾', price: 110 },
]

describe('練習 3：MenuService 與 MenuController', () => {
  it('有 src/menu.service.ts 與 src/menu.controller.ts', () => {
    expect(service?.MenuService, '找不到 MenuService：在 work/01 資料夾執行 npx nest g service menu --flat').toBeTypeOf('function')
    expect(controller?.MenuController, '找不到 MenuController：在 work/01 資料夾執行 npx nest g controller menu --flat').toBeTypeOf('function')
  })

  it('MenuService.findAll() 回傳三杯飲品', async () => {
    expect(service?.MenuService, '先用 nest g service menu --flat 產生 MenuService').toBeTypeOf('function')
    const ref = await Test.createTestingModule({ providers: [service!.MenuService] }).compile()
    const menu = ref.get(service!.MenuService)
    expect(typeof menu.findAll, 'MenuService 要有 findAll() 方法').toBe('function')
    expect(await menu.findAll(), 'findAll() 要回傳美式咖啡 80、拿鐵 110、卡布奇諾 110').toEqual(drinks)
  })

  it('GET /menu 回傳的是注入進來的 MenuService.findAll()', async () => {
    expect(service?.MenuService, '先用 nest g service menu --flat 產生 MenuService').toBeTypeOf('function')
    const fake = [{ name: '測試用飲品', price: 1 }]
    const app = await createTestApp(AppModule, { override: b => b.overrideProvider(service!.MenuService).useValue({ findAll: () => fake }) })
    apps.push(app)
    const res = await request(app.getHttpServer()).get('/menu')
    expect(res.body, '測試把 MenuService 換成假的，/menu 就要回假的資料：MenuController 要在建構子注入 MenuService 並呼叫 findAll()，不要自己 new MenuService() 或把資料寫在 controller 裡').toEqual(fake)
  })

  it('AppController 不再處理 /menu', async () => {
    const ref = await Test.createTestingModule({ controllers: [AppController], providers: [AppService] }).compile()
    const app = ref.createNestApplication({ logger: false })
    await app.init()
    apps.push(app)
    const res = await request(app.getHttpServer()).get('/menu')
    expect(res.status, '把 AppController 裡的 /menu 刪掉，菜單只由 MenuController 負責').toBe(404)
  })
})
