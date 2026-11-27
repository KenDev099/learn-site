// 練習 4：上線前檢查
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager'
import type { INestApplication } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js'
import { ConfigService } from '@nestjs/config'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { ProductsController } from './src/catalog/products.controller.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { build, start } from '../../helpers/server.ts'

// 判分時不讀 .env：測試要的設定在這裡給（vi.hoisted 在所有 import 之前執行）
vi.hoisted(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = 'test-only-webhook-secret-0123456789'
  process.env.ADMIN_KEY = 'test-only-admin-key-0123456789'
})

let app: INestApplication
let prisma: PrismaService
let adminKey: string
beforeAll(async () => {
  app = await createTestApp(AppModule, { configure: configureApp, options: { logger: false, rawBody: true } })
  prisma = app.get(PrismaService)
  adminKey = app.get(ConfigService).getOrThrow<string>('ADMIN_KEY')
})
afterAll(async () => {
  vi.restoreAllMocks()
  await app?.close()
})
beforeEach(async () => {
  await resetDb(prisma)
  await app.get<Cache>(CACHE_MANAGER).clear()
  await prisma.category.create({ data: { name: '咖啡' } })
  await prisma.product.createMany({ data: [
    { categoryId: 1, name: '美式咖啡', price: 80, stock: 20 },
    { categoryId: 1, name: '拿鐵', price: 110, stock: 20 },
  ] })
})

const http = () => request(app.getHttpServer())
const SRC = join(import.meta.dirname, 'src')

describe('練習 4：上線前檢查', () => {
  it('沒有循環 import，nest build 後 node dist/main.js 能啟動：/health/live、/health/ready、/api/v1/menu 都是 200', async () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.startsWith('generated/'))
    const imports = (f: string) => [...readFileSync(join(SRC, f), 'utf8').replace(/^\s*\/\/.*$/gm, '')
      .matchAll(/import\s+(?!type\b)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)]
      .map(m => relative(SRC, resolve(dirname(join(SRC, f)), m[1])).replace(/\.js$/, '.ts'))
    const done = new Set<string>(), path: string[] = []
    const visit = (f: string): string | undefined => {
      if (path.includes(f)) return [...path.slice(path.indexOf(f)), f].join(' → ')
      if (done.has(f) || !files.includes(f)) return
      path.push(f)
      for (const next of imports(f)) { const c = visit(next); if (c) return c }
      path.pop(); done.add(f)
    }
    const cycle = files.map(f => visit(f)).find(Boolean)
    expect(cycle, '循環 import（Vitest 會過，node dist/main.js 會在啟動時 ReferenceError）。讓依賴只往一個方向，forwardRef 只是把問題蓋住').toBeUndefined()

    build(import.meta.dirname)
    const server = await start(import.meta.dirname)
    try {
      for (const path of ['/health/live', '/health/ready', '/api/v1/menu']) {
        // 剛啟動時第一次連資料庫比較慢：跟平台的 readiness 探針一樣，失敗就隔一下再試，最多 20 秒
        let res = await fetch(server.url + path)
        for (const deadline = Date.now() + 20_000; res.status !== 200 && Date.now() < deadline;) {
          await new Promise(r => setTimeout(r, 500))
          res = await fetch(server.url + path)
        }
        expect(res.status, `冒煙測試：${path} 要 200，收到 ${res.status}：${await res.text()}\n${server.output().slice(-1500)}`).toBe(200)
      }
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('/health/live 不檢查資料庫：資料庫掛了 live 還是 200，ready 是 503', async () => {
    const spy = vi.spyOn(prisma, '$queryRawUnsafe').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5433'))
    try {
      expect((await http().get('/health/ready')).status, 'ready 要檢查資料庫').toBe(503)
      expect((await http().get('/health/live')).status, 'liveness 只看程序活著：資料庫一掛，每一台都被判定死掉、一起被重啟，重啟也修不好資料庫').toBe(200)
    } finally {
      spy.mockRestore()
    }
  })

  it('管理端點都要管理員金鑰，而且用 guard 檢查（不是寫在 controller 方法裡）', async () => {
    for (const key of [undefined, 'wrong-key']) {
      const req = (r: request.Test) => key ? r.set('X-Admin-Key', key) : r
      expect((await req(http().patch('/api/v1/products/2')).send({ price: 1 })).status, `PATCH /api/v1/products/:id 沒有正確的 X-Admin-Key（${key ?? '沒帶'}）要 401`).toBe(401)
      expect((await req(http().post('/api/v1/products')).send({ categoryId: 1, name: '可頌', price: 70, stock: 5 })).status, 'POST /api/v1/products 沒有正確的金鑰要 401').toBe(401)
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 2 } })).price, '被擋下的請求不能改到價格').toBe(110)
    const proto = ProductsController.prototype as unknown as Record<string, object>
    const routes = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined)
    const guarded = (n: string) => [...(Reflect.getMetadata(GUARDS_METADATA, ProductsController) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, proto[n]) ?? [])].length > 0
    expect(routes.filter(n => !guarded(n)), '這些路由沒有掛 guard：用 @UseGuards(AdminGuard)（掛在 class 上，之後新增的路由也自動受保護），不要在每個方法裡自己比對金鑰').toEqual([])
    const ok = await http().patch('/api/v1/products/2').set('X-Admin-Key', adminKey).send({ price: 120 })
    expect(ok.status, `帶正確的金鑰要能改價，收到 ${ok.status}：${ok.text}`).toBe(200)
  })

  it('DTO 沒宣告的欄位：400，不會被寫進資料庫', async () => {
    const res = await http().patch('/api/v1/products/2').set('X-Admin-Key', adminKey).send({ price: 95, stock: 999 })
    expect(res.status, 'UpdateProductDto 沒有 stock：多送的欄位要 400（ValidationPipe 的 whitelist＋forbidNonWhitelisted），前端馬上知道送錯').toBe(400)
    const product = await prisma.product.findUniqueOrThrow({ where: { id: 2 } })
    expect(product.stock, '庫存被 PATCH 改掉了：dto 直接當 Prisma 的 data，多送的欄位就會寫進資料庫（mass assignment）').toBe(20)
    expect(product.price, '整個請求被拒絕，價格也不能改').toBe(110)
  })

  it('菜單有快取，改價之後馬上看到新價格', async () => {
    const before = await http().get('/api/v1/menu')
    expect(before.status).toBe(200)
    expect(before.body.find((p: { id: number }) => p.id === 2)?.price).toBe(110)
    await prisma.product.update({ where: { id: 2 }, data: { price: 999 } })   // 繞過 API 直接改：快取還是舊的
    expect((await http().get('/api/v1/menu')).body.find((p: { id: number }) => p.id === 2)?.price, '菜單要走快取（cache-aside）').toBe(110)
    const res = await http().patch('/api/v1/products/2').set('X-Admin-Key', adminKey).send({ price: 120 })
    expect(res.status, res.text).toBe(200)
    expect((await http().get('/api/v1/menu')).body.find((p: { id: number }) => p.id === 2)?.price, '透過 API 改價之後菜單要馬上更新：拆掉循環時不能把 menu.invalidate() 一起拿掉').toBe(120)
  })
})
