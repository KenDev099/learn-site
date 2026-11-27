// 練習 3：PaymentModule.registerAsync 從設定建立 PaymentClient
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Test, type TestingModule } from '@nestjs/testing'
import type { PaymentClient } from './src/payment/payment.client.js'

const KEYS = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'CORS_ORIGINS', 'ORDER_MAX_ITEMS', 'FEATURE_STAMPS', 'PAYMENT_BASE_URL', 'PAYMENT_API_KEY']
const BASE = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://learn:learn@127.0.0.1:5433/nest_11' }
const opened: TestingModule[] = []
afterEach(async () => { for (const ref of opened.splice(0)) await ref.close() })

async function payment(env: Record<string, string>) {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, env)
  vi.resetModules()
  try {
    const { AppModule } = await import('./src/app.module.js')
    const { PaymentClient: Client } = await import('./src/payment/payment.client.js')
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
    opened.push(ref)
    return ref.get<PaymentClient>(Client, { strict: false }).options
  } finally {
    for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]
  }
}

describe('練習 3：PaymentModule.registerAsync', () => {
  it('app.module.ts 與 src/payment 不讀 process.env', () => {
    const dir = import.meta.dirname
    const files = [join(dir, 'src/app.module.ts'), ...readdirSync(join(dir, 'src/payment')).map(f => join(dir, 'src/payment', f))]
    for (const file of files) {
      // process.env、process['env']、const { env } = process、import { env } from 'node:process' 都算
      expect(readFileSync(file, 'utf8'), `${file.split('/src/')[1]} 直接讀了 process.env：改用 registerAsync({ inject: [ConfigService], useFactory })，從 ConfigService 拿驗證過的值`).not.toMatch(/\bprocess\s*(?:\??\.\s*env\b|\[)|\benv\b[^=;]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b|from\s+['"](?:node:)?process['"]/)
    }
  })

  it('baseUrl 的預設值只寫在 env.schema.ts', () => {
    expect(readFileSync(join(import.meta.dirname, 'src/app.module.ts'), 'utf8'), 'app.module.ts 裡還有 sandbox.pay.example.test：預設值寫在 envSchema 的 PAYMENT_BASE_URL，useFactory 直接用 config.get 的結果，不要再補一次').not.toContain('sandbox.pay.example.test')
  })

  it('apiKey 與 baseUrl 來自環境變數', async () => {
    expect(await payment({ ...BASE, PAYMENT_API_KEY: 'pk_test_aaa', PAYMENT_BASE_URL: 'https://pay-a.test' }), 'PaymentClient.options 要是設定裡的 PAYMENT_API_KEY 與 PAYMENT_BASE_URL').toEqual({ apiKey: 'pk_test_aaa', baseUrl: 'https://pay-a.test' })
    expect(await payment({ ...BASE, NODE_ENV: 'production', PAYMENT_API_KEY: 'pk_live_bbb', PAYMENT_BASE_URL: 'https://pay-b.test' }), '換一組值也要跟著變：不能把 apiKey 或 baseUrl 寫死').toEqual({ apiKey: 'pk_live_bbb', baseUrl: 'https://pay-b.test' })
  })

  it('沒設定 PAYMENT_BASE_URL 時用 schema 的預設值', async () => {
    const options = await payment(BASE)
    expect(options.baseUrl, 'baseUrl 要用 envSchema 的預設 https://sandbox.pay.example.test（從 ConfigService 拿，預設值只寫在 schema 一個地方）').toBe('https://sandbox.pay.example.test')
    expect(options.apiKey, '本機沒設定 PAYMENT_API_KEY 時 apiKey 是 undefined，不要塞假的金鑰').toBeUndefined()
  })
})
