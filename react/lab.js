// React 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'react-progress'
export const STAGES = [
  ['階段 1：心智模型：從 Vue 到 React', [
    [1, '重新 render 是什麼：UI 是 state 的函式', '01-render-model.html'],
    [2, 'JSX 與元件：props、children、條件與列表', '02-jsx-components.html'],
    [3, 'state 與事件：useState、快照與不可變更新', '03-state-events.html'],
    [4, '表單：受控元件與輸入處理', '04-forms-controlled.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：Hooks 與副作用', [
    [5, 'useEffect：跟外部系統同步、清理與競態', '05-effects.html'],
    [6, '你可能不需要 effect：衍生值、事件與 key', '06-you-might-not-need-effect.html'],
    [7, 'useRef 與 DOM：不觸發 render 的值、ref 與焦點', '07-refs-dom.html'],
    [8, 'useReducer：把狀態轉換寫成純函式', '08-reducer.html'],
    [9, '自訂 hook：抽出有狀態的邏輯', '09-custom-hooks.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：元件設計與型別', [
    [10, '組合：children、render props 與 compound components', '10-composition.html'],
    [11, 'Context：跨層傳遞與重新 render 的代價', '11-context.html'],
    [12, '元件的型別：props、泛型元件與事件', '12-typing-components.html'],
    [13, 'Portal、Suspense 與 Error Boundary', '13-portal-suspense-error-boundary.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：狀態與資料', [
    [14, '狀態放哪裡：元件、提升、URL 與 Zustand', '14-state-placement.html'],
    [15, '伺服器狀態：TanStack Query 的快取與失效', '15-tanstack-query.html'],
    [16, '寫入資料：mutation、樂觀更新與 useOptimistic', '16-mutations-optimistic.html'],
    [17, '表單進階：Actions、useActionState 與驗證', '17-actions-forms.html'],
    [18, '路由：React Router 的巢狀路由、loader 與守衛', '18-routing.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：效能與渲染', [
    [19, '效能：先量測，再用 memo、useMemo、useCallback', '19-performance-memo.html'],
    [20, 'React 的規則與 React Compiler', '20-react-compiler.html', '選修'],
    [21, '並行功能：useTransition、useDeferredValue 與 Suspense', '21-concurrent.html', '選修'],
    [22, '渲染策略：CSR、SSR、Server Components 與 Next.js', '22-rendering-strategies.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：品質與期末專題', [
    [23, '元件測試：Testing Library，測行為不測實作', '23-testing.html'],
    [24, '錯誤處理、無障礙與前端監控', '24-errors-a11y-monitoring.html'],
    [25, '期末專題：咖啡店線上點餐（React 版）', '25-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
