import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 開發時前台開在 5174；/api 開頭的請求轉給 API（http://localhost:3100），並拿掉 /api 前綴
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3100', rewrite: path => path.replace(/^\/api/, '') },
    },
  },
})
