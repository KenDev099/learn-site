---
title: React 階段 4：狀態與資料
subtitle: 第 14～18 課一頁圖解：狀態放哪裡、Zustand、TanStack Query、mutation 與樂觀更新、Actions 表單、React Router
cols: 3
theme: shadcn
課程: React 第 14～18 課
---
先問誰要讀、正本在哪，再決定狀態放哪裡。伺服器資料當成快取管，寫入後讓對的快取失效；表單、換頁、守衛都掛在 React 19 的 Action 與路由上。[回 React 學習地圖](../index.html)

## A 狀態放哪裡 {span=2}
從上往下問，第一個回答「是」的就是答案；越往下範圍越大，代價也越大。

| 情境 | React 放哪裡 | Vue 的對應 |
|---|---|---|
| 正本在伺服器（菜單、訂單紀錄） | TanStack Query | 伺服器狀態快取（Vue 課第 17 課） |
| 要能分享、重新整理後還在 | 網址 query（`useSearchParams`） | `route.query` |
| 只有一個元件用 | 元件內 `useState` | 元件內 `ref` |
| 幾個相鄰元件用 | 提升到共同父元件 | 父元件 `ref` 加 props／emit |
| 整個 app 共用、常常變 | Zustand store | Pinia store |
| 一棵子樹共用、很少變 | Context | provide／inject |

每份狀態只有一份。只有一個元件用的 state 往下放，不要先用 memo 補；網址是唯一來源，輸入框的草稿另外放元件裡，送出才寫進網址。

## B Zustand：selector 決定誰重新 render
| 寫法 | 什麼時候重新 render |
|---|---|
| `useCartStore()` | warn store 任何欄位變了 |
| `useCartStore(s => s.add)` | ok 幾乎不會，action 的參考不變 |
| `useCartStore(selectCount)` | ok 件數這個數字變了 |
| `useCartStore(s => ({ … }))` | no 每次都是新物件，Zustand 5 無限迴圈 |

```callout err 要選好幾個值
用 `useShallow` 包住 selector。`memo` 擋不了 store 的通知，store 直接通知訂閱的元件。
```
- `set` 只合併第一層，巢狀要自己不可變更新；`set(…, true)` 整個取代，連 action 都會不見；重設用 `getInitialState()`。
- 件數、小計這類算得出來的值寫成 selector，不存成 state。
- 測試每次重設；SSR 改用 `createStore` 加 Context；`persist` 要有 version，讀回來的資料自己驗證。

## C TanStack Query：伺服器狀態是一份快取 {span=2}
```flow LR
[抓取中] -> *[新鮮]: 抓回來
[新鮮] -> [過期]: 過了 staleTime
[過期] -> [抓取中]: 掛載 聚焦 重連時背景重抓
[過期] -> [被清掉]: 沒人使用超過 gcTime
```
| 設定 | 預設 | 意思 |
|---|---|---|
| `staleTime` | 0 | 一抓回來就算過期；要少重抓先調它，不是逐一關觸發點 |
| `gcTime` | 5 分鐘 | 最後一個使用者離開後多久清掉 |
| `retry` | 瀏覽器 3 次 | 讀取失敗才重試；mutation 預設 0 次 |

`QueryClient` 在元件外建立一次，用 Provider 交給元件。同一個 key 同時被好幾個元件用只送一個請求；每個 key 各存各的，競態自然消失。`queryFn` 要收 `{ signal }` 並傳給 API，舊請求才會真的取消。

## D 載入畫面與 queryKey
| 欄位 | 回答的問題 |
|---|---|
| `status` | 有沒有資料：`pending`、`error`、`success` |
| `fetchStatus` | 有沒有在抓：`fetching`、`paused`、`idle` |

- 沒有資料（`isPending`）才顯示大的載入畫面；有資料又在抓（`isFetching`）只加小的「更新中…」。
- 背景重抓失敗時 `data` 還在，保留舊資料，另外顯示錯誤。
- `queryFn` 用到的每個變數都放進 `queryKey`，由大到小排，用 key factory 產生。
- 換參數不想閃：`placeholderData: keepPreviousData`，搭配 `isPlaceholderData`。

## E 寫入之後讓誰失效
```callout ok 前綴比對
`invalidateQueries({ queryKey: ['products'] })` 選到整棵樹：畫面上有元件在用的立刻重抓，沒人用的標成過期，下次使用時才重抓。
```
| 方法 | 畫面上的 query | 沒人用的 query |
|---|---|---|
| `invalidateQueries` | 標成過期並重抓 | 標成過期，下次使用時重抓 |
| `refetchQueries` | 重抓 | 預設也重抓 |
| `removeQueries` | 從快取刪掉，不重抓 | 刪掉，下次從載入中開始 |

- `useMutation` 只在 `mutate()` 時執行，預設不重試；送出中用 `isPending` 停用按鈕。
- 一定要做的事（失效）寫在 `useMutation` 的選項；關對話框這類元件相關的事寫在 `mutate` 的第二個參數。
- 回傳 `invalidateQueries` 的 Promise，mutation 會等重抓完才結束。

## F 樂觀更新選哪一種 {span=2}
| 做法 | 樂觀的值放哪 | 失敗時 | 適合 |
|---|---|---|---|
| 只 invalidate | 沒有，等伺服器 | 顯示錯誤 | 改價、下單、付款 |
| `onMutate` 改快取 | query 快取，所有元件都看得到 | `onError` 自己改回 | 收藏、勾選，好幾處要同步 |
| mutation 的 `variables` | 這個元件的 render | 自然消失 | 只有一處顯示 |
| `useOptimistic` | 這個元件，Action 期間 | Action 結束自然消失 | 不用 TanStack Query、表單 Action |

快取式的順序：`cancelQueries`、存下原值、不可變地改快取；`onError` 改回；`onSettled` 重抓對齊。

```callout warn 好幾個同時進行
回復用 `variables` 只改回自己那一格，不要整份還原；`isMutating({ mutationKey }) === 1` 才重抓。付款、下單、會被伺服器改寫的值，不要樂觀。
```
`useOptimistic` 的更新要在 Transition 或 Action 裡；`await` 之後的 `setState` 要再包 `startTransition`。

## G 表單：Actions 與 useActionState
```flow LR
[送出訂單] -> [React 收集 FormData]
[React 收集 FormData] -> [action prev formData]: 在 Transition 裡執行
[action prev formData] -> *[回傳新的 state]: 錯誤 values orderId
[回傳新的 state] -> [重設非受控欄位]: defaultValue 接 state 保留輸入
```
| | `onSubmit`（第 4 課） | `<form action={fn}>` |
|---|---|---|
| 拿到什麼 | submit 事件，要 `preventDefault` | `FormData`（含送出的按鈕） |
| 送出中 | 自己用 state 記 | React 追蹤，`useFormStatus` 讀 |
| 丟錯 | 沒人接 | 交給最近的 Error Boundary |

- `useFormStatus` 要在 form 裡的子元件呼叫；在 render form 的同一個元件裡，`pending` 永遠是 false。
- 預期中的錯誤（驗證、422）回傳成 state，只有程式錯誤才丟；每次回傳都從初始值組，不要 `{ ...prev }`。
- 驗證：讀成固定形狀的字串、zod `safeParse`、`flattenError`；伺服器仍要自己驗。

## H React Router：路由器在畫面出現前做完事 {span=2}
```flow LR
(點連結) -> [比對網址]
[比對網址] -> [middleware 由外到內]
[middleware 由外到內] -> [loader 同時開始]
[loader 同時開始] -> *[render 新頁面]
[middleware 由外到內] --> [redirect 或 403]: throw
[loader 同時開始] --> [最近的 ErrorBoundary]: throw
```
| Vue Router | React Router 8.5.1 |
|---|---|
| `<RouterView />` | `<Outlet />` |
| 守衛 `beforeEach` | middleware |
| 進頁面前抓資料，沒有內建 | loader |
| `'/:pathMatch(.*)*'` | `'*'`，放在 Layout 的 children |

- 版面放父路由，換頁不重建；子路由寫相對 path；剛好是父路由網址的頁面用 `index: true`。
- loader 先驗證 `params`，把 `request.signal` 傳給 API；預期中的「不存在」`throw data(…, { status: 404 })`，其他錯誤原樣丟出。
- 守衛放在要保護那一層的 middleware：沒登入 `throw redirect`（redirect 參數要編碼），沒權限丟 403。前端守衛是體驗，真正的檢查在後端。
- 搜尋放網址：GET 的 `<Form>`、loader 讀 `?q=`、輸入框 `key={q}`。
