---
title: Vue 3 階段 6：路由、權限與錯誤處理
subtitle: 第 19～21 課一頁圖解：Vue Router、query 狀態、導航守衛、權限、錯誤邊界、錯誤回報與部署
cols: 3
theme: shadcn
課程: Vue 3 第 19～21 課
---
網址是可分享的狀態。前端權限檢查只是體驗，真正防線在伺服器。錯誤由下往上傳，區塊顯示替代畫面，app 集中回報。[回 Vue 3 學習地圖](../index.html)

## A 站內換頁與重新整理 {span=2}
```flow LR
[站內點連結] -> [router.push]: pushState，不發請求
[重新整理 /menu/3] -> [GET /menu/3]
[GET /menu/3] -> {伺服器有設定?}
{伺服器有設定?} -> *[回傳 index.html]: 有，Vue Router 讀網址畫出商品頁
{伺服器有設定?} -> [404]: 沒有
```
`router.push()` 對應 pushState，`router.replace()` 對應 replaceState，按上一頁觸發 `popstate`。history 模式要讓伺服器把找不到的路徑回傳 index.html，前端路由表另外要有自己的找不到頁面；hash 模式不用設定，但網址較醜、不利 SEO；測試和 SSR 用 `createMemoryHistory()`。

## B 路由表與換參數
- `:id(\\d+)` 限制參數格式；`name` 讓連結不依賴路徑。
- 子路由顯示在父元件的 `<RouterView />`，path 不以 `/` 開頭。
- `/:pathMatch(.*)*` 接住其他路徑。
- `props: route => ({ id: Number(route.params.id) })` 讓頁面不依賴路由；`props: true` 給的是字串。

```callout warn 同一條路由換參數，元件被重用
`/menu/1` 到 `/menu/2` 不會重新掛載，`onMounted` 不再執行。改用 `watch(() => props.id, …, { immediate: true })` 並取消舊請求。`<RouterView :key="route.fullPath" />` 會強制重建，但丟掉所有狀態。
```

## C 網址也是狀態
| | params `/menu/2` | query `/menu?category=tea` |
|---|---|---|
| 代表 | 資源的身分 | 篩選、排序、頁碼 |
| 可以省略 | no 少了就是另一條路由 | ok 沒有就用預設值 |

- query 是外部輸入：值是字串、可能是 `null` 或陣列，要驗證。
- 篩選用 `router.replace` 並保留其他鍵：`{ query: { ...route.query, category: 'tea' } }`。
- 網址是唯一的來源，不要再存一份 ref；token、個資不放 query。
- 路由元件用 `() => import()` 懶載入，不用 `defineAsyncComponent`。
- `<KeepAlive>` 放在 RouterView 的 slot 裡，設 `include` 和 `max`，用 `onActivated` 重新整理。

## D 前端的權限只是體驗
```flow LR
[瀏覽器 守衛與隱藏按鈕] -> [API 伺服器 每個請求檢查]
[攻擊者 curl] -> [API 伺服器 每個請求檢查]: 跳過整個前端
[API 伺服器 每個請求檢查] -> [(資料庫 RLS)]
```
權限 = 角色 × 動作 × 資源。寫成純函式 `can(user, action, order)`，守衛、按鈕、選單都呼叫它。

| 角色 | order:view | order:cancel | order:ready |
|---|---|---|---|
| customer | 自己的訂單 | 自己的、狀態是 pending | no 不行 |
| barista | 自己門市的 | no 不行 | 自己門市的 |
| manager | 自己門市的 | 自己門市的 | 自己門市的 |

```callout err 預設拒絕
店長和訂單都缺 `storeId` 時，`undefined === undefined` 會放行。資料缺了、角色或動作不認得，一律 `false`。
```

## E 全域守衛 {span=2}
```flow LR
(導航) -> [await 同一個 loadMe Promise]
[await 同一個 loadMe Promise] -> {requiresAuth 且沒登入?}
{requiresAuth 且沒登入?} -> [login 加 redirect]: 是，帶 to.fullPath
{requiresAuth 且沒登入?} -> {有 permission?}: 否
{有 permission?} -> [403 頁]: 沒有
{有 permission?} -> *放行: 有
```
| 守衛回傳 | 結果 |
|---|---|
| 什麼都不回傳或 `true` | 放行 |
| `false` | 取消，留在原頁 |
| 路由位置 | 改導到那裡，再經過一次守衛 |

先看登入、再看權限；巢狀路由的 `to.meta` 會合併，用 module augmentation 加型別。登入頁和 403 頁不能要求登入，不然會導向迴圈。舊寫法的 `next` 在 vue-router 5 已標成 deprecated。登入狀態存 Promise，連點兩次導航也只呼叫一次 `/me`。

## F 回跳網址、401 與 403、離開保護
- `?redirect=` 是外部輸入：只接受以單一 `/` 開頭的站內路徑；擋掉 `//`、反斜線、控制字元，再用 `new URL(target, 基準網址)` 確認 origin 沒變，不過就導回預設頁。
- 401 是不知道你是誰，走刷新流程；403 是知道你是誰但不能做，顯示沒有權限並重新取得使用者。
- `v-if` 隱藏按鈕不等於保護，不該看的欄位要伺服器不回傳。
- `onBeforeRouteLeave` 保護還沒存的表單，dirty 跟最後一次成功存下的內容比；關分頁、重新整理用 `beforeunload`。

## G 錯誤怎麼往上傳 {span=2}
```flow LR
[子元件出錯] -> [ErrorBoundary onErrorCaptured]
[ErrorBoundary onErrorCaptured] -> [App onErrorCaptured]: 沒回傳 false
[App onErrorCaptured] -> [app.config.errorHandler]: 沒回傳 false
[ErrorBoundary onErrorCaptured] --> (停止): 回傳 false，自己要回報
```
| 來源 | Vue 攔得到嗎 |
|---|---|
| setup、render、生命週期、watcher | ok |
| 事件處理，包括 async 在 await 之後丟錯 | ok Vue 接住回傳的 Promise |
| `setTimeout`、第三方 callback | no 用 window 的 `error` |
| 沒有 catch 的 Promise | no 用 `unhandledrejection` |

錯誤邊界用 `v-if`／`v-else` 切換，重試時子元件重建；替代畫面不能再渲染出錯的內容。正式環境沒處理的 Vue 錯誤只印在 console，3.5 起可設 `throwUnhandledErrorInProduction`。

## H 回報與部署後的錯誤
```kv cols=1
回報欄位: message、stack、info、route、release、匿名使用者 id
不能送: token、密碼、手機、身分證字號、完整信用卡號；送出前依欄位名稱遮罩
量: 同一個錯誤去重，量大時抽樣
source map: build.sourcemap 設 hidden，上傳給監控並標同一個 release，再從 dist 刪掉
```
| 部署後 chunk 404 的對策 | 做法 |
|---|---|
| 快取標頭 | `index.html` 用 `no-cache`；帶 hash 的檔案快取一年加 `immutable` |
| 舊檔保留 | 先傳 assets、最後換 HTML，不加 `--delete` |
| 失敗時重新整理 | `vite:preloadError` 或 `router.onError` 擇一，用 sessionStorage 防無限重新整理 |
| 版本檢查 | 開很久的頁面比對 `version.json`，提示「有新版本」，不自動重新整理 |

給客人看的錯誤說人話、給下一步、能重試就給按鈕。
