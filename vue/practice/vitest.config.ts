import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 透過 learn/check.mjs 執行：npx vitest run work/<題號>（cwd 是 vue/practice）
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['work/**/*.test.ts', 'verify/**/*.test.ts'],
    setupFiles: ['./helpers/setup.ts'],
    unstubGlobals: true,
    restoreMocks: true,
  },
})
