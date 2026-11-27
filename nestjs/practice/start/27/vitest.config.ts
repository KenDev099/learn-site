import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// 你自己寫的測試：在這個資料夾執行 npm test。Vitest 5 不會往上層資料夾找設定檔，所以每一課都有一份
// 測試永遠不碰開發用的資料：資料庫換成 <名稱>_spec（nest_27 → nest_27_spec），Redis key 的開頭加上 -spec
config({ quiet: true })   // 讀 .env；已經有的環境變數優先，不會被蓋掉
if (!process.env.DATABASE_URL) throw new Error('沒有 DATABASE_URL：先在 learn/ 執行 node check.mjs nestjs 27，它會建立 .env')
const url = new URL(process.env.DATABASE_URL)
url.pathname = url.pathname.replace(/(_test|_spec)?$/, '_spec')
process.env.DATABASE_URL = url.href
process.env.REDIS_PREFIX = `${(process.env.REDIS_PREFIX ?? 'nest-27').replace(/-spec$/, '')}-spec`

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: false,   // 測試檔共用同一個資料庫與佇列：一次只跑一個檔
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
