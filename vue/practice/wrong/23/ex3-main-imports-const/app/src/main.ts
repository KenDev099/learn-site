// 練習 3 的入口（不用改）：vite build 從這裡開始打包，這個檔案和它靜態 import 的一切都在主 chunk
import { createApp } from 'vue'
import { createWebHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter } from './router.ts'
import { REPORT_TITLE } from './pages/AdminReports.vue'

document.title = `咖啡店（${REPORT_TITLE}）`

createApp(App).use(createAppRouter(createWebHistory())).mount('#app')
