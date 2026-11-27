---
title: React 階段 5：效能與渲染
subtitle: 第 19～22 課一頁圖解：先量測、memo 與 useMemo、React Compiler、useTransition 與 useDeferredValue、CSR 到 Server Components
cols: 3
theme: shadcn
課程: React 第 19～22 課
---
先量測再修，預設不加 memo。Compiler 自動記憶化，前提是程式遵守 React 的規則。並行功能只調整先後，不讓 render 變快。每頁先選 HTML 在哪裡產生，再選哪些元件送到瀏覽器。[回 React 學習地圖](../index.html)

## A 量到的原因決定修法 {span=2}
用 React DevTools 的 Profiler 看誰 render、為什麼、花多久；毫秒數要用正式版本確認，開發模式只適合找「誰、為什麼」。

| 量到的原因 | 修法 |
|---|---|
| state 放太高，改動時整片子樹跟著 render | state 往下放；慢的內容用 `children` 從沒有那個 state 的元件傳進去 |
| 子元件 props 沒變，因為父元件 render 而 render，而且很慢 | `memo`，函式 props 用 `useCallback` |
| render 裡某個計算很慢，跟這次改動無關卻重算 | `useMemo` |
| 已經 memo，原因寫著物件或陣列 props 變了 | `useMemo` 讓那個 prop 保持同一個參考 |

先試結構調整，再考慮 memo；沒量就加，常常多了程式、沒有變快。

```callout warn memo 是一條鏈，斷一環就白做
每個物件、陣列、函式 prop 都要從上面一路穩定下來；inline 的物件或函式、只包 `useCallback` 沒包 `memo`、依賴陣列少寫或用 eslint-disable 壓掉、在元件裡呼叫 `memo()`，都會白做或讓畫面停在舊資料。元件自己的 state、context、store 變了，memo 擋不住。
```
拿掉 memo 程式就壞了，代表有 bug；預設不加，量過才加。

## B Compiler 的前提：兩條規則 {span=2}
React Compiler 在 build 時自動記憶化，判斷「沒變」用參考比較，所以它假設程式遵守規則。違反規則的程式在沒有記憶化時看起來正常，開了才壞。

| 規則 | 違反的寫法 | 修法 |
|---|---|---|
| props、state 不可變 | `menu.sort()`、`hit.qty += 1`、`lines.push()` | `toSorted`；有變的那一列換新，其餘沿用原本參考 |
| render 是純的 | render 裡 `Date.now()`、`Math.random()`、`useState(Date.now())` | 現在時間放進 state：`useState(() => Date.now())` 讀一次，計時器更新 |

- 每一列都複製一份（`{ ...l }`、`structuredClone`）內容對，但記憶化全部失效。
- 拿掉 memo 讓畫面「好了」，只是多重算幾次蓋住問題。
- 畫面只顯示分鐘，計時器就每 60 秒更新；整張清單一個計時器。

```callout info 對照 Vue
Vue 的 `computed` 用 Proxy 追蹤讀了哪些屬性，直接改 `line.qty` 是它期待的寫法。React 的記憶化只比較參考，要讓它知道「變了」，只能給它新物件。
```

## C 用 lint 抓違規，再導入 Compiler
| 寫法 | eslint-plugin-react-hooks 7.1.1 |
|---|---|
| render 裡 `Date.now()`、`Math.random()` | ok 回報 purity |
| 改 props 的屬性、用索引改 state 陣列 | ok 回報 immutability |
| `menu.sort(…)`、事件裡 `lines.push(…)` | no 沒有回報 |
| `find` 拿到的物件再 `.qty += 1`、render 裡 `new Date()` | no 沒有回報 |

lint 沒錯不代表遵守規則，要靠測試補（凍結輸入、檢查參考）。有回報的元件 Compiler 會自動跳過，其他照樣編譯。

1. 先開 recommended 規則、修完錯誤。
2. 裝 `babel-plugin-react-compiler`；React 19 不用另外設 target。
3. 用 DevTools 的 Memo ✨ 確認有沒有生效。
4. 某個畫面壞了，加 `"use no memo"` 暫時隔離，再去修。既有的 `useMemo`、`useCallback` 先留著。

## D 急的更新與不急的更新 {span=2}
```flow LR
(打字) -> [急的 render 與 commit]: 輸入框已更新
[急的 render 與 commit] -> [不急的 render 在背景]: 慢的區塊用新值
[不急的 render 在背景] -> *[commit]: 一次換上
[不急的 render 在背景] --> [放棄重來]: 又打了字
```
急的先處理；不急的 render 可以被打斷、從頭重來，完成前畫面留著舊的。因為 render 可能被丟掉重來，render 必須是純的。

| 你手上有什麼 | 用什麼 |
|---|---|
| 能呼叫 state 的 set 函式 | `useTransition`：`startTransition(() => setX(…))`，`isPending` 顯示切換中 |
| 只有一個值，或輸入框的 state 必須立刻更新 | `useDeferredValue`：延後的值交給慢的元件，並包 `memo` |

輸入框的 setState 不能放進 `startTransition`。`await` 之後的 `setState` 要再包一層。

## E 選哪一個，以及 Suspense
| 情況 | 用什麼 |
|---|---|
| 輸入框打字卡，底下很慢的一塊 | `useDeferredValue` 加 `memo` |
| 按按鈕換分頁，新內容 render 很慢 | `useTransition` |
| 換分類時已顯示的內容被 fallback 換掉 | setState 放進 `startTransition` |
| 搜尋框等結果時一直閃 fallback | `useDeferredValue`，延後的值交給會暫停的元件 |
| 要減少網路請求 | debounce、TanStack Query |
| 計算本身每次都慢 | 回到第 19 課：量測、`useMemo`、`memo` |

```callout warn 新的 Suspense 邊界照樣顯示 fallback
給 Suspense 一個會變的 `key` 就是新邊界，Transition 也擋不住。`isPending` 只加小提示，不要拿來換掉舊內容。
```
Vue 沒有急與不急的區分，常見做法是 debounce；`useDeferredValue` 沒有固定延遲，也不減少請求。

## F 每一頁的 HTML 在哪裡產生 {span=2}
| 頁面 | 選擇 |
|---|---|
| 門市介紹、關於我們（幾個月改一次） | SSG：建置時產生 |
| 商品頁（價格、售完狀態每天會變） | SSR，或預先產生再定時重新產生（ISR） |
| 購物車、結帳（每個人不同） | SSR 的外框加瀏覽器裡的互動，或 CSR |
| 店員訂單後台（只有店員、一直在變） | CSR，維持 Vite |

Server Components 是另一個維度：CSR、SSR、SSG 回答 HTML 什麼時候、在哪裡產生，Server Component 回答元件的程式碼要不要送到瀏覽器。

- 先依「誰要看 HTML、資料多常變」逐頁選，再依「這塊要不要互動」決定哪些元件送到瀏覽器。
- Next.js 16.4.5：`fetch` 從 15 版起預設不快取；開 `cacheComponents` 後資料預設動態，用 `'use cache'` 選擇快取，沒快取的部分用 Suspense 串流。快取設定以專案的版本查官方文件。

## G Hydration：第一次 render 要和伺服器一樣
伺服器用 `renderToString`，瀏覽器用 `hydrateRoot`，不是 `createRoot`。

| 不一致的地方 | React 19 的處理 |
|---|---|
| 文字或節點 | warn 丟掉伺服器的 DOM，在瀏覽器重新 render，畫面會閃 |
| 屬性 | no 只在 console 警告，不修正 |

| 來源 | 修法 |
|---|---|
| 時間、亂數 | 由參數傳入同一個值，算小時要指定時區 |
| id | `useId()`，不用計數器或亂數 |
| 只有瀏覽器知道的值 | effect 或 `useSyncExternalStore` 的 `getServerSnapshot`，hydration 之後才讀 |

伺服器的資料序列化進頁面，瀏覽器用同一份 hydrate，不再抓；JSON 放進 `<script>` 要把 `<` 換成 `\u003c`。`suppressHydrationWarning` 只用在無法避免的單一元素。

## H Server 與 Client 的邊界
- Server Component 可以 async、直接查資料、程式碼不送到瀏覽器；不能用 state、effect、context。Next.js 16 的 App Router 預設就是它。
- Client Component 第一次載入也在伺服器 render，hydration 的規則照樣適用。
- `'use client'` 標記整棵 import 樹，放在需要互動的葉子，不要放在 layout；Server Component 可以當 `children` 傳進去。

| 能傳給 Client Component | 不能傳 |
|---|---|
| 字串、數字、布林、`Date`、`Map`、`Set`、`Promise` | 一般函式、class 實例 |
| 一般物件、陣列、JSX、Server Function | 沒註冊的 symbol |

```callout err Server Function 是任何人都能呼叫的 API
`'use server'` 的函式要驗證身分與參數，用來改資料、不用來抓資料。只傳 Client Component 需要的欄位，整個 user 物件傳下去會進 RSC Payload。
```
