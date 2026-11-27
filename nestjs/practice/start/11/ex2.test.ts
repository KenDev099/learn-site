// 練習 2：用 registerAs 建立 ordersConfig，注入 OrdersService
import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

const configMod: Record<string, any> = await import('./src/config/orders.config.js')
const ordersConfig = configMod.ordersConfig
const KEYS = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'CORS_ORIGINS', 'ORDER_MAX_ITEMS', 'FEATURE_STAMPS', 'PAYMENT_BASE_URL', 'PAYMENT_API_KEY']
const apps: INestApplication[] = []
afterAll(async () => { for (const app of apps) await app.close() })

const order = (qty: number) => ({ items: [{ productId: 2, qty: qty - 1 }, { productId: 5, qty: 1 }] })

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])
}

describe('練習 2：有型別的設定 ordersConfig', () => {
  it('src/config/orders.config.ts export 用 registerAs 建立的 ordersConfig', () => {
    expect(ordersConfig, 'orders.config.ts 要 export const ordersConfig = registerAs(\'orders\', () => ({ maxItems: … }))').toBeTypeOf('function')
    expect(ordersConfig.KEY, 'ordersConfig 要用 registerAs 建立，才有 ordersConfig.KEY 可以注入').toBeDefined()
  })

  it('src/orders 底下不讀 process.env', () => {
    for (const file of filesUnder(join(import.meta.dirname, 'src/orders'))) {
      expect(readFileSync(file, 'utf8'), `${file.split('/src/')[1]} 直接讀了 process.env：設定要從注入的 ordersConfig 拿`).not.toMatch(/\bprocess\s*(?:\??\.\s*env\b|\[)|\benv\b[^=;]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b|from\s+['"](?:node:)?process['"]/)
    }
  })

  it('maxItems 從注入的設定來：換成 2 時，3 杯回 422 TOO_MANY_ITEMS，2 杯可以下單', async () => {
    expect(ordersConfig?.KEY, '先完成 ordersConfig').toBeDefined()
    const app = await createTestApp(AppModule, { override: b => b.overrideProvider(ordersConfig.KEY).useValue({ maxItems: 2 }) })
    apps.push(app)
    const tooMany = await request(app.getHttpServer()).post('/orders').send(order(3))
    expect(tooMany.status, '把 ordersConfig 換成 { maxItems: 2 } 之後，3 杯要回 422：OrdersService 要用 @Inject(ordersConfig.KEY) 注入設定').toBe(422)
    expect(tooMany.body.errorCode, '超過上限要丟 TooManyItemsError（errorCode TOO_MANY_ITEMS）').toBe('TOO_MANY_ITEMS')
    const ok = await request(app.getHttpServer()).post('/orders').send(order(2))
    expect(ok.status, '剛好 2 杯（等於上限）要可以下單').toBe(201)
    expect(ok.body.total, '拿鐵 1 杯 + 可頌 1 個 = 180').toBe(180)
  })

  it('ORDER_MAX_ITEMS 寫在 .env 檔裡也會生效（設定在 ConfigModule 載入 .env 之後才讀）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'learn-nest-11-'))
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgresql://learn:learn@127.0.0.1:5433/nest_11\nORDER_MAX_ITEMS=4\n')
    const cwd = process.cwd()
    const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]))
    for (const k of KEYS) delete process.env[k]
    process.chdir(dir)   // ConfigModule 從目前工作目錄找 .env
    vi.resetModules()
    try {
      const fresh = await import('./src/app.module.js')
      const app = await createTestApp(fresh.AppModule)
      apps.push(app)
      const tooMany = await request(app.getHttpServer()).post('/orders').send(order(5))
      expect(tooMany.status, '.env 寫 ORDER_MAX_ITEMS=4，5 杯要回 422。沒擋下來的話，檢查是不是在檔案最上層讀了 process.env：那時 .env 還沒載入').toBe(422)
      expect((await request(app.getHttpServer()).post('/orders').send(order(4))).status, '4 杯要可以下單').toBe(201)
    } finally {
      process.chdir(cwd)
      for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
