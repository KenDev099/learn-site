import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// 你自己寫的測試：在這個資料夾執行 npm test。Vitest 5 不會往上層資料夾找設定檔，所以每一課都有一份
// 測試永遠不碰開發用的資料庫：把 DATABASE_URL 的資料庫名稱換成 <名稱>_spec（nest_17 → nest_17_spec）
config({ quiet: true })   // 讀 .env；已經有的環境變數優先，不會被蓋掉
if (!process.env.DATABASE_URL) throw new Error('沒有 DATABASE_URL：先在 learn/ 執行 node check.mjs nestjs 17，它會建立 .env')
const url = new URL(process.env.DATABASE_URL)
url.pathname = url.pathname.replace(/(_test|_spec)?$/, '_spec')
process.env.DATABASE_URL = url.href   // Vitest 的主程序（globalSetup）和每個 worker 都看這個值

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: false,   // 測試檔共用同一個資料庫：一次只跑一個檔
  },
})
