import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { taskEnv } from './helpers/task.ts'

// 判分用：learn/check.mjs 執行 npx vitest run work/<題號>（出題檢查是 verify/<題號>-<pid>-<label>），cwd 是 delivery/practice
// 從指令列找出這次測的資料夾，讓測試用這一題自己的資料庫（DATABASE_URL）；TZ 固定 UTC，跟正式機一樣
// 預設是 node 環境；Vue 元件測試在檔案第一行寫 // @vitest-environment happy-dom
const codeDir = process.argv.find(a => /^(work|verify)\/[^/]+\/?$/.test(a))

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['work/**/*.test.ts', 'verify/**/*.test.ts'],
    env: codeDir ? taskEnv(codeDir) : {},
    fileParallelism: false,   // 同一題的測試檔共用這一題的資料庫
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 10_000,
  },
})
