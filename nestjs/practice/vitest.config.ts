import { defineConfig } from 'vitest/config'
import { taskEnv } from './helpers/task.ts'

// 判分用：learn/check.mjs 執行 npx vitest run work/<題號>（出題檢查是 verify/<題號>-<pid>-<label>），cwd 是 nestjs/practice
// 從指令列找出這次測的資料夾，讓測試用這一題自己的資料庫與 Redis key 前綴（DATABASE_URL、REDIS_URL、REDIS_PREFIX）
// 學習者自己的測試（*.spec.ts）在 task 資料夾裡用 npm test 跑，用的是 task 自己的 vitest.config.ts
const codeDir = process.argv.find(a => /^(work|verify)\/[^/]+\/?$/.test(a))

export default defineConfig({
  test: {
    globals: true,
    include: ['work/**/*.test.ts', 'verify/**/*.test.ts'],
    env: codeDir ? taskEnv(codeDir) : {},
    fileParallelism: false,   // 同一題的測試檔共用這一題的資料庫
    testTimeout: 20_000,
    hookTimeout: 60_000,
    teardownTimeout: 10_000,
  },
})
