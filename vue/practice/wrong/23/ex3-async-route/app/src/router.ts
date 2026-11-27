// 練習 3：管理報表頁懶載入
// 問題：只有店長會打開 /admin/reports，可是 AdminReports.vue（之後還會帶進圖表套件）被靜態 import，
//       每位顧客打開點餐頁都要先下載它。
// 要求：
//   1. 讓 AdminReports.vue 變成獨立的 chunk：主 chunk（main.ts 的入口）不能包含它的程式碼
//   2. 導航到 /admin/reports 時仍然顯示 AdminReports（路由元件直接給載入函式，不要用 defineAsyncComponent）
//   3. HomePage 維持靜態 import：首頁是每個人都會看到的頁面
//   4. main.ts 和其他模組都不要從 AdminReports.vue import 任何東西，否則整個模組會被拉回主 chunk
import { createRouter, type RouterHistory } from 'vue-router'
import { defineAsyncComponent } from 'vue'
import HomePage from './pages/HomePage.vue'

export function createAppRouter(history: RouterHistory) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomePage },
      // 給載入函式：第一次導航到這裡才下載，vite build 會把它切成獨立的 chunk
      { path: '/admin/reports', name: 'admin-reports', component: defineAsyncComponent(() => import('./pages/AdminReports.vue')) },
    ],
  })
}
