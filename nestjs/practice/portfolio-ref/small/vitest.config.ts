import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// npm test：單元測試（src/**/*.spec.ts）與 E2E（test/**/*.e2e-spec.ts）。
// 測試永遠不碰開發用的資料：資料庫名稱加上 _spec（event_signup → event_signup_spec）
config({ quiet: true })
if (!process.env.DATABASE_URL) throw new Error('沒有 DATABASE_URL：複製 .env.example 成 .env')
const url = new URL(process.env.DATABASE_URL)
url.pathname = url.pathname.replace(/(_test|_spec)?$/, '_spec')
process.env.DATABASE_URL = url.href

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
