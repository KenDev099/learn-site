import { defineConfig } from 'vitest/config'

// npm test：跑 api/src 底下的 *.spec.ts（打真的 Nest app 與資料庫）
// 資料庫用 api/.env 的 DATABASE_URL；已經設定的環境變數不會被蓋掉
process.loadEnvFile('api/.env')

export default defineConfig({
  test: {
    include: ['api/src/**/*.spec.ts'],
    fileParallelism: false,   // 測試檔共用同一個資料庫
  },
})
