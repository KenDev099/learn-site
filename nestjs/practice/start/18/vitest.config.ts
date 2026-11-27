import { defineConfig } from 'vitest/config'

// 你自己寫的測試：在這個資料夾執行 npm test。Vitest 5 不會往上層資料夾找設定檔，所以每一課都有一份
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts', 'test/**/*.int-spec.ts'],
    fileParallelism: false,
  },
})
