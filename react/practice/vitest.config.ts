import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 透過 learn/check.mjs 執行：npx vitest run work/<題號>（cwd 是 react/practice）
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['work/**/*.test.{ts,tsx}', 'verify/**/*.test.{ts,tsx}'],
    setupFiles: ['./helpers/setup.ts'],
    unstubGlobals: true,
    restoreMocks: true,
  },
})
