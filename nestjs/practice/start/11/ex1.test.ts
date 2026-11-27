// 練習 1：用 zod 寫環境變數的 schema，交給 ConfigModule.forRoot 在啟動時驗證
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test, type TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import request from 'supertest'

const KEYS = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'CORS_ORIGINS', 'ORDER_MAX_ITEMS', 'FEATURE_STAMPS', 'PAYMENT_BASE_URL', 'PAYMENT_API_KEY']
const BASE = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://learn:learn@127.0.0.1:5433/nest_11' }
const opened: { close(): Promise<unknown> }[] = []

// 用指定的環境變數重新載入 app.module.js 並建立模組。ConfigModule.forRoot() 在 app.module.js 第一次被 import 時就讀環境變數，
// 所以每一種環境都要 vi.resetModules() 再 import 一次
async function boot(env: Record<string, string>): Promise<{ ref?: TestingModule, error?: Error, AppModule?: any }> {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, env)
  vi.resetModules()
  try {
    const { AppModule } = await import('./src/app.module.js')
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
    opened.push(ref)
    return { ref, AppModule }
  } catch (error) {
    return { error: error as Error }
  } finally {
    for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]
  }
}

async function config(env: Record<string, string>) {
  const { ref, error } = await boot(env)
  expect(error?.message, `這組環境變數應該要能啟動：${JSON.stringify(env)}`).toBeUndefined()
  return ref!.get(ConfigService)
}

afterEach(async () => {
  for (const ref of opened.splice(0)) await ref.close()
})

describe('練習 1：啟動時驗證環境變數', () => {
  it('缺 DATABASE_URL 或不是網址時，模組建立失敗，錯誤訊息寫出 DATABASE_URL', async () => {
    const missing = await boot({ NODE_ENV: 'development' })
    expect(missing.error, '沒有 DATABASE_URL 也啟動了：在 AppModule imports 加上 ConfigModule.forRoot({ validationSchema: envSchema })，DATABASE_URL 必填').toBeDefined()
    expect(missing.error!.message, '錯誤訊息要指出是哪個變數').toContain('DATABASE_URL')
    const bad = await boot({ ...BASE, DATABASE_URL: 'not-a-url' })
    expect(bad.error?.message ?? '', 'DATABASE_URL 要是網址（z.url()），not-a-url 不能過').toContain('DATABASE_URL')
  })

  it('沒設定的變數用預設值，PORT 與 ORDER_MAX_ITEMS 是 number', async () => {
    const c = await config({ DATABASE_URL: BASE.DATABASE_URL })
    expect(c.get('NODE_ENV'), 'NODE_ENV 預設 development').toBe('development')
    expect(c.get('PORT'), 'PORT 預設 3100，而且要是 number（z.coerce.number()），不是字串 "3100"').toBe(3100)
    expect(c.get('ORDER_MAX_ITEMS'), 'ORDER_MAX_ITEMS 預設 20（number）').toBe(20)
    expect(c.get('FEATURE_STAMPS'), 'FEATURE_STAMPS 預設 true（boolean）').toBe(true)
    expect(c.get('CORS_ORIGINS'), 'CORS_ORIGINS 預設 ["http://localhost:5173"]（陣列）').toEqual(['http://localhost:5173'])
    expect(c.get('PAYMENT_BASE_URL'), 'PAYMENT_BASE_URL 預設 https://sandbox.pay.example.test').toBe('https://sandbox.pay.example.test')
    const port = await config({ ...BASE, PORT: '4000' })
    expect(port.get('PORT'), 'PORT=4000 要變成 number 4000').toBe(4000)
    for (const value of ['', '0', '-1', '2.5', 'abc']) {
      expect((await boot({ ...BASE, PORT: value })).error?.message ?? '', `PORT=${JSON.stringify(value)} 要讓啟動失敗：PORT 是正整數。注意 Number('') 是 0，要加 .int().positive()`).toContain('PORT')
    }
  })

  it('FEATURE_STAMPS 的 "false" 要變成 false', async () => {
    expect((await config({ ...BASE, FEATURE_STAMPS: 'false' })).get('FEATURE_STAMPS'), 'FEATURE_STAMPS="false" 變成了 true？z.coerce.boolean() 把任何非空字串都當 true，改用 z.stringbool()').toBe(false)
    expect((await config({ ...BASE, FEATURE_STAMPS: 'true' })).get('FEATURE_STAMPS'), 'FEATURE_STAMPS="true" 要是 true').toBe(true)
    expect((await boot({ ...BASE, FEATURE_STAMPS: 'flase' })).error?.message ?? '', '拼錯的 "flase" 要讓啟動失敗，而不是默默當成 true 或 false').toContain('FEATURE_STAMPS')
  })

  it('ORDER_MAX_ITEMS 限制在 1–50', async () => {
    for (const value of ['0', '51', 'abc', '2.5']) {
      expect((await boot({ ...BASE, ORDER_MAX_ITEMS: value })).error?.message ?? '', `ORDER_MAX_ITEMS=${value} 要讓啟動失敗（整數 1–50）`).toContain('ORDER_MAX_ITEMS')
    }
    expect((await config({ ...BASE, ORDER_MAX_ITEMS: '50' })).get('ORDER_MAX_ITEMS'), 'ORDER_MAX_ITEMS=50 可以').toBe(50)
  })

  it('PAYMENT_API_KEY 只有 production 必填', async () => {
    const prod = await boot({ ...BASE, NODE_ENV: 'production' })
    expect(prod.error?.message ?? '', 'NODE_ENV=production 卻沒有 PAYMENT_API_KEY，應該不能啟動，錯誤訊息要寫出 PAYMENT_API_KEY').toContain('PAYMENT_API_KEY')
    await config({ ...BASE, NODE_ENV: 'production', PAYMENT_API_KEY: 'pk_live_dummy' })
    await config({ ...BASE, NODE_ENV: 'development' })
    await config({ ...BASE, NODE_ENV: 'test' })
    expect((await boot({ ...BASE, NODE_ENV: 'prod' })).error?.message ?? '', 'NODE_ENV 只能是 development、test、production').toContain('NODE_ENV')
  })

  it('CORS_ORIGINS 以逗號分隔、去掉空白，configureApp 用它設定 CORS', async () => {
    const env = { ...BASE, CORS_ORIGINS: 'http://a.test, http://b.test' }
    const c = await config(env)
    expect(c.get('CORS_ORIGINS'), '逗號後面的空白要去掉（trim），不然 " http://b.test" 永遠比對不到瀏覽器送的 Origin').toEqual(['http://a.test', 'http://b.test'])
    expect((await config({ ...BASE, CORS_ORIGINS: 'http://a.test,, http://b.test, ' })).get('CORS_ORIGINS'), '多打的逗號、結尾的逗號會產生空字串，要用 .filter(Boolean) 去掉').toEqual(['http://a.test', 'http://b.test'])

    const { ref } = await boot(env)
    const { configureApp } = await import('./src/app.setup.js')
    const app = ref!.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    opened.push(app)
    const allowed = await request(app.getHttpServer()).get('/').set('Origin', 'http://b.test')
    expect(allowed.headers['access-control-allow-origin'], 'configureApp 要用設定的 CORS_ORIGINS：http://b.test 應該被允許').toBe('http://b.test')
    const old = await request(app.getHttpServer()).get('/').set('Origin', 'http://localhost:5173')
    expect(old.headers['access-control-allow-origin'], '不在 CORS_ORIGINS 裡的來源不能被允許：不要把 http://localhost:5173 寫死在程式裡').toBeUndefined()
  })
})
