import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// npm test：單元測試（src/**/*.spec.ts）與 E2E（test/**/*.e2e-spec.ts）。資料庫名稱加 _spec、Redis key 加 -spec，不碰開發資料
config({ quiet: true })
for (const k of ['DATABASE_URL', 'APP_DATABASE_URL']) {
  if (!process.env[k]) throw new Error(`沒有 ${k}：複製 .env.example 成 .env`)
  const url = new URL(process.env[k]!)
  url.pathname = url.pathname.replace(/(_test|_spec)?$/, '_spec')
  process.env[k] = url.href
}
process.env.REDIS_PREFIX = `${(process.env.REDIS_PREFIX ?? 'my-saas').replace(/-spec$/, '')}-spec`

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
