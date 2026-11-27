// 練習 2：AdminKeyGuard 與 @AdminOnly()。測試在 import AppModule 之後才設定 ADMIN_KEY，中途還會換一把
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import * as guardModule from './src/admin-key.guard.js'
import * as decoratorModule from './src/admin-only.decorator.js'

// 記錄 timingSafeEqual 被怎麼呼叫（行為不變）
const { calls, spyCrypto } = vi.hoisted(() => {
  const calls: [Buffer, Buffer][] = []
  const spyCrypto = async (importOriginal: () => Promise<typeof import('node:crypto')>) => {
    const real = await importOriginal()
    const timingSafeEqual = (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      calls.push([Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)])
      return real.timingSafeEqual(a, b)
    }
    return { ...real, default: { ...real, timingSafeEqual }, timingSafeEqual }
  }
  return { calls, spyCrypto }
})
vi.mock('node:crypto', spyCrypto)
vi.mock('crypto', spyCrypto)

const original = process.env.ADMIN_KEY
const KEY = 'k1-' + 'a'.repeat(29)
let app: INestApplication | undefined
beforeEach(() => { process.env.ADMIN_KEY = KEY })
afterEach(async () => { await app?.close(); app = undefined })
afterAll(() => { if (original === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = original })

async function open(override?: Parameters<typeof createTestApp>[1]) {
  app = await createTestApp(AppModule, override)
  return () => request(app!.getHttpServer())
}
const newProduct = { name: '冰滴咖啡', price: 130 }

describe('練習 2：管理員金鑰', () => {
  it('GET 不用金鑰；POST /orders 也不用', async () => {
    const http = await open()
    expect((await http().get('/products')).status, 'GET /products 誰都能查，不需要金鑰').toBe(200)
    expect((await http().get('/products/1')).status, 'GET /products/1 誰都能查，不需要金鑰').toBe(200)
    expect((await http().post('/orders').send({ items: [{ productId: 2, quantity: 1 }] })).status, 'POST /orders 是顧客下單，不能被管理員金鑰擋住：只在商品的 POST、PATCH、DELETE 加 @AdminOnly()').toBe(201)
  })

  it('沒帶 X-Admin-Key：POST、PATCH、DELETE /products 都回 401', async () => {
    const http = await open()
    expect((await http().post('/products').send(newProduct)).status, '沒帶 X-Admin-Key 要回 401（還不知道你是誰）：throw new UnauthorizedException()。回 403 的話，是 guard 直接 return false 了；回 201 表示 guard 沒有生效').toBe(401)
    expect((await http().patch('/products/1').send({ price: 85 })).status, 'PATCH /products/1 沒帶金鑰要回 401').toBe(401)
    expect((await http().delete('/products/1')).status, 'DELETE /products/1 沒帶金鑰要回 401').toBe(401)
    expect((await http().get('/products/1')).body.price, '被擋下的 PATCH 不能真的改到資料').toBe(80)
  })

  it('金鑰錯誤回 403，長度不同也是 403（不是 500）', async () => {
    const http = await open()
    const wrongSameLength = 'k1-' + 'b'.repeat(29)
    expect((await http().post('/products').set('X-Admin-Key', wrongSameLength).send(newProduct)).status, '金鑰錯誤要回 403：guard return false 就是 403').toBe(403)
    const short = await http().post('/products').set('X-Admin-Key', 'abc').send(newProduct)
    expect(short.status, '3 個字元的錯誤金鑰回了 ' + short.status + '：crypto.timingSafeEqual 遇到長度不同的 Buffer 會丟 RangeError（變成 500），先比長度，不同就直接當成錯誤').toBe(403)
    expect((await http().delete('/products/1').set('X-Admin-Key', KEY + 'x')).status, '多一個字元的金鑰也要回 403').toBe(403)
    process.env.ADMIN_KEY = 'k1-' + 'a'.repeat(28) + 'é'   // 32 個字、UTF-8 是 33 個位元組
    const bytes = await http().post('/products').set('X-Admin-Key', KEY).send(newProduct)
    expect(bytes.status, `ADMIN_KEY 含 é（32 個字、33 個位元組），送來的金鑰是 32 個字、32 個位元組，回了 ${bytes.status}：要比的是 Buffer 的 length（位元組數），不是字串的 length`).toBe(403)
  })

  it('金鑰正確：POST 201、PATCH 200、DELETE 204；ADMIN_KEY 每次請求時才讀', async () => {
    const http = await open()
    const created = await http().post('/products').set('X-Admin-Key', KEY).send(newProduct)
    expect(created.status, '帶正確的 X-Admin-Key 要能新增商品（201）。回 403 的話：ADMIN_KEY 要在請求時才讀 process.env，不要在檔案最上層讀；測試是 import 完才設定的').toBe(201)
    expect((await http().patch('/products/1').set('X-Admin-Key', KEY).send({ price: 85 })).status, '帶正確金鑰 PATCH 要回 200').toBe(200)
    process.env.ADMIN_KEY = 'k2-' + 'c'.repeat(40)
    expect((await http().delete('/products/2').set('X-Admin-Key', KEY)).status, 'ADMIN_KEY 換了之後，舊的金鑰要失效（403）：每次請求都要讀目前的 process.env.ADMIN_KEY，不要存起來').toBe(403)
    expect((await http().delete('/products/2').set('X-Admin-Key', process.env.ADMIN_KEY)).status, '帶新的金鑰 DELETE 要回 204').toBe(204)
  })

  it('伺服器沒有設定 ADMIN_KEY 時，任何金鑰都不能通過', async () => {
    const http = await open()
    delete process.env.ADMIN_KEY
    for (const key of ['x', 'undefined']) {
      const res = await http().post('/products').set('X-Admin-Key', key).send(newProduct)
      expect(res.status, `沒設定 ADMIN_KEY 時，帶 ${JSON.stringify(key)} 也要被拒絕（403），設定漏了要「全部擋下」，不是全部放行`).toBe(403)
    }
  })

  it('規則寫在 AdminKeyGuard 裡，用 APP_GUARD＋useExisting 註冊（測試可以換掉它）', async () => {
    const Guard = (guardModule as Record<string, unknown>).AdminKeyGuard as (new (...args: never[]) => unknown) | undefined
    expect(Guard, 'src/admin-key.guard.ts 要 export class AdminKeyGuard').toBeTypeOf('function')
    const http = await open({ override: b => b.overrideProvider(Guard!).useValue({ canActivate: () => true }) })
    const res = await http().post('/products').send(newProduct)
    expect(res.status, '測試把 AdminKeyGuard 換成「一律放行」之後，沒帶金鑰的 POST 應該成功（201）。沒有成功代表：金鑰檢查寫在 controller 裡，或是用 APP_GUARD＋useClass 註冊（overrideProvider 換不到）。要寫成 { provide: APP_GUARD, useExisting: AdminKeyGuard }，並把 AdminKeyGuard 也放進 providers').toBe(201)
  })

  it('標記寫在哪裡就保護哪裡：guard 用 Reflector 同時讀方法與 class 上的 @AdminOnly()', async () => {
    const AdminOnly = (decoratorModule as Record<string, unknown>).AdminOnly as ((value?: boolean) => (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => void) | undefined
    expect(AdminOnly, 'src/admin-only.decorator.ts 要 export const AdminOnly = Reflector.createDecorator<boolean>(…)').toBeTypeOf('function')
    @Controller('probe-admin')
    class ProbeController {
      @Get('locked') locked() { return { ok: true } }
      @Get('open') open() { return { ok: true } }
    }
    AdminOnly!()(ProbeController)
    AdminOnly!(false)(ProbeController.prototype, 'open', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'open'))
    @Module({ imports: [AppModule], controllers: [ProbeController] })
    class ProbeModule {}
    app = await createTestApp(ProbeModule)
    const http = () => request(app!.getHttpServer())
    expect((await http().get('/probe-admin/locked')).status, '整個 controller 貼了 @AdminOnly()，連 GET 也要帶金鑰（401）：guard 要用 reflector.getAllAndOverride(AdminOnly, [context.getHandler(), context.getClass()]) 讀標記，不要用 HTTP 方法或網址判斷，也不要只讀方法').toBe(401)
    expect((await http().get('/probe-admin/locked').set('X-Admin-Key', KEY)).status, '帶正確金鑰要放行（200）').toBe(200)
    expect((await http().get('/probe-admin/open')).status, '方法上的 @AdminOnly(false) 要蓋掉 class 上的 @AdminOnly()（200）：getAllAndOverride 先看方法、再看 class').toBe(200)
  })

  it('金鑰用 crypto.timingSafeEqual 比較', async () => {
    const http = await open()
    calls.length = 0
    const wrong = 'k1-' + 'z'.repeat(29)
    await http().post('/products').set('X-Admin-Key', wrong).send(newProduct)
    const compared = calls.some(([a, b]) => [a.toString(), b.toString()].sort().join('|') === [wrong, KEY].sort().join('|'))
    expect(compared, '長度相同的金鑰要交給 node:crypto 的 timingSafeEqual(Buffer.from(給的), Buffer.from(ADMIN_KEY)) 比較：=== 一發現不同就停，花的時間會洩漏猜對了幾個字').toBe(true)
    const code = readFileSync(join(import.meta.dirname, 'src/admin-key.guard.ts'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    expect(code, '不要用 === 或 !== 比較金鑰本身，用 timingSafeEqual').not.toMatch(/(ADMIN_KEY|expected|given|key)\s*[!=]==\s*(process\.env\.ADMIN_KEY|expected|given|key)\b/i)
  })
})
