---
title: Vue 3 階段 7：品質、效能與架構
subtitle: 第 22～26 課一頁圖解：元件測試、效能量測與打包、SSR 與 hydration、專案架構、期末專題
cols: 3
theme: shadcn
課程: Vue 3 第 22～26 課
---
測試檢查使用者看得到的行為，效能先量測再動手。SSR 要讓兩邊第一次渲染一致，專案用依賴方向守住邊界。[回 Vue 3 學習地圖](../index.html)

## A 測行為，在邊界換依賴 {span=2}
| 依賴實作細節 | 依賴行為 |
|---|---|
| no `wrapper.vm.submitting` | ok `button.element.disabled` |
| no `wrapper.get('.btn-primary')` | ok 用 role、label、文字找按鈕 |
| no `wrapper.find('.error-text')` | ok `[role="alert"]` |
| no 呼叫 `wrapper.vm.load()` | ok 點「重試」按鈕 |

| 依賴 | 測試裡怎麼換 |
|---|---|
| API client | 用 props 或 provide 注入假的 |
| callback | `vi.fn()`；要控制完成時間就回傳 `deferred().promise` |
| Pinia | `createTestingPinia`，每個測試建立新的 |
| 路由 | 真的 `createRouter` 加 `createMemoryHistory()`，守衛照樣執行 |
| 時間 | `vi.useFakeTimers()` 或傳入 `now()` |

純函式測試最多、元件測試涵蓋主要行為、E2E 只留給關鍵流程。預設用 `mount`。非同步用 deferred 決定 API 何時完成，再 `await flushPromises()`，不要 sleep。好測試在錯誤版本上失敗、在重構過的正確版本上通過；不穩定測試的常見原因是真實時間、亂數、共用狀態、等待不夠、忘了 await。

## B 先量測：慢在哪裡
| 指標 | 意思 | 好的標準 |
|---|---|---|
| LCP | 主要內容多久出現 | 2.5 秒內 |
| INP | 點擊、打字到畫面更新的延遲 | 200 毫秒內 |

- Performance 面板加 CPU 降速，Vue DevTools 的 Timeline，`app.config.performance = true`。
- 報告改善數字用 `vite build` 後的 `vite preview`，結果寫進 PR。
- `onRenderTriggered` 告訴你哪個屬性觸發了重新渲染；watch、computed 用 `onTrigger`。只在開發模式有效。

## C 更新的成本：props 穩定性 {span=2}
```flow LR
[傳 selected-id] -> [200 列 props 都變了]: selectedId 1005 → 1151
[200 列 props 都變了] -> [200 列都更新]
[傳 selected 布林值] -> [只有兩列 props 變了]: 父元件先算好
[只有兩列 props 變了] -> *[只更新 2 列]
```
這課的示範：訂單看板 200 列，點選一筆時從 200 列更新降到 2 列。

| 工具 | 什麼時候用 |
|---|---|
| computed 內容相同回傳舊物件 | 用第一個參數拿上一次的值 |
| `v-once` | 真的不會變的內容 |
| `v-memo="[order.id === selectedId]"` | warn 最後手段：陣列漏了值，畫面停在舊狀態且沒有錯誤 |
| `shallowRef`、`markRaw` | 大量唯讀資料、第三方實例 |
| 虛擬列表 | 上千列時只渲染看得到的列 |

## D 打包：一開始少下載一點
- 路由直接給 `() => import()`；一般元件用 `defineAsyncComponent`，設 `timeout`（預設永遠等）。
- 一處靜態 import 就會把模組拉回主 chunk；共用常數放獨立的小檔案。
- 選 tree-shaking 友善的套件：`lodash-es` 不是 `lodash`。
- 分割太細會變成請求瀑布。
- 用 `vite build` 的輸出確認，看 gzip 那一欄。

```callout info Vite 8 改用 Rolldown
`build.rollupOptions` 改名 `build.rolldownOptions`；`manualChunks` 改用 `output.codeSplitting`；預設目標 Chrome 111、Firefox 114、Safari 16.4。
```

## E 三種渲染方式與 hydration {span=2}
| | CSR | SSR | SSG |
|---|---|---|---|
| HTML 何時產生 | 瀏覽器執行 JS 後 | 每次請求 | 建置時 |
| 首次看到內容 | 慢 | 快，但 TTFB 較晚 | 最快 |
| 伺服器 | 靜態檔案 | 一直開著 Node 程序 | 靜態檔案 |
| 適合 | 登入後的後台 | 內容常變、要被搜尋 | 不常變的頁面 |

```flow LR
[伺服器 renderToString] -> [HTML 看得到內容]
[HTML 看得到內容] -> [瀏覽器 createSSRApp mount]
[瀏覽器 createSSRApp mount] -> *hydration: 認領現有 DOM、掛上事件
```
兩邊第一次渲染要一樣。屬性不一致時 Vue 只檢查不修正。需要 SSR 的新專案用 Nuxt，`routeRules` 可以逐頁混用；Vue 3.5 的 `hydrateOnVisible` 等可以延遲 hydration。

## F 寫出 SSR 安全的程式
- 伺服器只跑 setup、render、`onServerPrefetch`；`onMounted` 之後都不跑。
- setup 和範本不碰 `window`、`localStorage`；副作用放 `onMounted`。
- 只有瀏覽器知道的值：兩邊先用同一個值，掛載後再改。

| 不一致的來源 | 修法 |
|---|---|
| 時間、時區 | 由參數傳同一個 `now`，指定 `timeZone` |
| 亂數 id | `useId()` |
| `<p><div>` 這類巢狀 | 改成合法的 HTML |
| 確定無法避免 | `data-allow-mismatch`，只讓警告閉嘴 |

```callout err 跨請求狀態污染
伺服器上，模組層級狀態被所有請求共用：這課的事故是陳美華打開購物車，看到王小明剛放進去的拿鐵。「開始時清空」在多個請求同時進行時無效；每個請求建立新的 app、pinia、router，用 provide／inject 傳遞。
```

## G 專案架構：依賴只往下 {span=2}
```flow LR
[app] -> [pages]
[pages] -> [features]
[features] -> [shared]
```
箭頭是允許的 import 方向，只能往下；shared 往上 import features、pages、app 一律禁止。
- feature 之間只 import 對方的 `index.ts`（公開介面），內部檔案可以自由重構；循環依賴通常把共同的東西往下搬到 shared。
- 只有 `shared/api` 呼叫 `fetch`。
- 規則用 lint 或測試自動檢查，再加行為測試擋住繞過字串檢查的寫法。
- 業務規則寫成純函式；UI 元件不知道業務名詞；第三次出現再抽共用元件。
- 只有 `VITE_` 變數進前端，建置時直接寫進 JS：不放密鑰；啟動時驗證設定，一次列出所有問題。
- 使用者的網址用 `new URL()` 解析，只允許 http、https；使用者的 HTML 不進 `v-html`。
- 用 ADR 記下背景與考慮過的選項。

## H 期末專題：每塊狀態放哪裡
| 資料 | 放哪裡 |
|---|---|
| 分類篩選 | 網址 query |
| 搜尋關鍵字、結帳表單 | 元件的 ref |
| 菜單、訂單狀態 | 有快取的查詢 |
| 購物車 | Pinia 加 storage，key 是商品加甜度、尺寸 |
| 登入的使用者 | Pinia auth store |

- `cart.clear()` 放在 await 成功之後，不放 `finally`。
- 防重複下單：進行中保護加冪等鍵，最後由伺服器擋。
- 輪詢的錯誤自己 catch 並提供重試；渲染錯誤用錯誤邊界圍住明細。
- 守衛和 `can()` 是體驗，伺服器才是安全；店員區懶載入，用打包結果確認。
