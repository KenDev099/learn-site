// Vue 3 深入與前端架構 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'vue-progress'
export const STAGES = [
  ['階段 1：響應式原理：自己做一個', [
    [1, '響應式是什麼：Proxy 與依賴追蹤', '01-what-is-reactivity.html'],
    [2, '自己做迷你響應式系統：effect、track、trigger', '02-mini-reactivity.html', '選修'],
    [3, '完成迷你版：ref 與 computed', '03-mini-ref-computed.html', '選修'],
  ], 'sheets/stage-1.html'],
  ['階段 2：Vue 響應式實戰', [
    [4, 'ref、reactive 與失去響應的陷阱', '04-ref-reactive-pitfalls.html'],
    [5, 'watch：副作用、清理與競態', '05-watchers.html'],
    [6, '排程器：批次更新、nextTick 與 flush 時機', '06-scheduler-nexttick.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：元件如何運作', [
    [7, '從範本到畫面：render、虛擬 DOM 與 key', '07-render-vdom-keys.html'],
    [8, '元件的一生：生命週期、template ref 與清理', '08-component-lifecycle.html'],
    [9, 'props 與 emits：單向資料流', '09-props-emits.html', '可略讀'],
    [10, 'v-model 與 defineModel', '10-v-model.html', '可略讀'],
    [11, 'slots 與 Teleport：把畫面交給使用者', '11-slots-teleport.html', '可略讀'],
  ], 'sheets/stage-3.html'],
  ['階段 4：重用與型別', [
    [12, 'composables：抽出有狀態的邏輯', '12-composables.html'],
    [13, 'provide/inject：跨層傳遞與依賴注入', '13-provide-inject.html'],
    [14, '元件的型別：泛型元件與 vue-tsc', '14-typed-components.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：狀態與資料', [
    [15, '狀態放哪裡：從元件狀態到 Pinia', '15-state-pinia.html'],
    [16, 'API 層：把 fetch 包成可靠的介面', '16-api-layer.html'],
    [17, '非同步資料：載入狀態、競態與快取', '17-async-data.html'],
    [18, '複雜表單：驗證、錯誤顯示與送出', '18-forms.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：路由、權限與錯誤處理', [
    [19, '路由：巢狀路由、參數與 URL 狀態', '19-routing.html'],
    [20, '路由守衛與權限：前端權限的界線', '20-guards-permissions.html'],
    [21, '錯誤處理與前端監控', '21-error-handling.html'],
  ], 'sheets/stage-6.html'],
  ['階段 7：品質、效能與架構', [
    [22, '元件測試：測行為，不測實作', '22-component-testing.html'],
    [23, '效能：先量測，再優化渲染與打包', '23-performance.html'],
    [24, '渲染策略：CSR、SSR、SSG 與 hydration', '24-ssr-hydration.html'],
    [25, '前端架構：模組邊界、依賴方向與設定', '25-architecture.html'],
    [26, '期末專題：咖啡店線上點餐', '26-capstone.html'],
  ], 'sheets/stage-7.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
