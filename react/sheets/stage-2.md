---
title: React 階段 2：Hooks 與副作用
subtitle: 第 5～9 課一頁圖解：useEffect、你可能不需要 effect、useRef、useReducer、自訂 hook
cols: 3
theme: shadcn
課程: React 第 5～9 課
---
先問這段程式為什麼要執行：要一個值就在 render 算，使用者做了操作放事件處理函式，要跟外部系統同步才用 effect；其他 hook 各管一件事。React 沒有追蹤，依賴與呼叫順序都要你自己守。[回 React 學習地圖](../index.html)

## A 這段程式該放哪裡 {span=2}
| 它為什麼要執行 | 放哪裡 | 例子 | Vue 的對應 |
|---|---|---|---|
| ok 畫面要一個算得出來的值 | render 中直接算 | 篩選後的菜單、合計 | `computed` |
| ok 使用者做了某個操作 | 事件處理函式 | 按「加入」、送出訂單、通知父元件 | 事件處理函式裡 `emit` |
| ok props 換成另一筆，整個元件要重來 | 父元件給 `key` | 換顧客時清空備註表單 | `:key` |
| ok 顯示在畫面上，要跟外部一致 | `useEffect` | 分頁標題、訂閱、計時器、統計 | `watch`、`onMounted` |
| warn 在 effect 裡只有 `setState` | 先問能不能算出來 | `setTotal(...)` | 用 `watch` 維護 `total` |

把 effect 裡的程式唸出來：「當 X 變了，就把 Y 設成…」多半能在 render 算；「當 X 變了，就去做 Z」先找出是哪個使用者操作造成的。

## B 依賴陣列：React 不追蹤，由你宣告
| 寫法 | 什麼時候執行 |
|---|---|
| `useEffect(fn)` | 每次 commit 之後 |
| `useEffect(fn, [])` | 第一次 commit 之後（開發模式多一輪） |
| `useEffect(fn, [a, b])` | 第一次 commit 之後，以及 `a` 或 `b` 跟上次不同時 |

- 用 `Object.is` 逐一比較；effect 讀到的 props、state、元件本體宣告的值都要列。
- 漏列，effect 讀到的是建立當下的快照；交給 `exhaustive-deps` 檢查，不要用 eslint-disable 蓋掉。
- 元件本體建立的物件、函式，每次 render 都會換新：搬進 effect，或用 `useEffectEvent` 讀最新的值又不因它重跑（不列進依賴，只在 effect 裡呼叫）。
- Vue 的 `watch` 預設建立時不執行，`useEffect` 第一次 commit 後一定執行。

## C 清理函式：每次同步都要能復原 {span=2}
```flow LR
(render 1) -> [setup 1]: commit 之後
[setup 1] -> (render 2): 依賴改變
(render 2) -> [cleanup 1]: 用舊的值清理
[cleanup 1] -> [setup 2]: 用新的值執行
[setup 2] -> *卸載: 呼叫 cleanup 2
```
- 清理要「回傳一個函式」：`return () => clearInterval(id)`；寫成 `return clearInterval(id)` 是當場就清掉。
- 開發模式的 StrictMode 在第一次 setup 前多跑一輪 setup、cleanup，用來檢查清理是否真的復原；問「清理少了什麼」，不要用 `useRef` 擋掉第二次。
- 計時器裡寫 `setSeconds(seconds + 1)` 讀到過期快照；改用 `setSeconds(s => s + 1)`。
- effect 的函式不能是 `async`，回傳的 Promise 不是清理函式；在裡面宣告 async 函式再呼叫。

## D 抓資料與競態
```sequence
participants: 商品頁, 請求 A, 請求 B
商品頁 -> 請求 A: productId 是 2，拿鐵
商品頁 -> 請求 B: productId 變 5，可頌
請求 B --> 商品頁: 先回來，畫面是可頌
請求 A --> 商品頁: 後回來，畫面被蓋回拿鐵
```
修法：每次 effect 有自己的 `ignore` 旗標，清理時設成 `true`，回應回來先檢查；同時用 `AbortController` 取消沒回來的請求，被取消的 `AbortError` 不要顯示成錯誤。正式專案多半交給 TanStack Query（第 15 課）。

## E 三種不需要 effect 的寫法
```kv cols=1
多餘的 state: 篩選、排序、件數都從來源算；存成 state 再用 effect 同步，會多幾次 commit，畫面先顯示錯的值。排序用 `toSorted()`
旗標 state 觸發 effect: 加入購物車的原因是「按了按鈕」，直接寫在事件處理函式；用 `added` 旗標會連按只加一次、父元件 render 時又多加一杯
通知父元件: 在同一個事件裡 `setQty` 加 `onChange`；不要用 effect（掛載就通知），也不要寫進 updater
```
換一筆資料要重設整個元件的 state：外層加 `key={customer.id}`，連非受控欄位一起重設。key 不用名字、`Math.random()`。只想調整部分 state 才在 render 中有條件地比較上一次，而且先試「改存 id 再算」。

## F useRef：不觸發 render 的值與 DOM
| 放在哪 | 跨 render 保留 | 改了會 render | 用在 |
|---|---|---|---|
| 元件裡的 `let` | no | no | 這次 render 的暫時計算 |
| `useState` | ok | ok | 畫面要顯示的資料 |
| `useRef` | ok | no | 計時器 id、DOM 節點、最新的 callback |
| 元件外面的變數 | ok | no | warn 所有元件共用，只放真正的全域常數 |

- Vue 的 `ref()` 對應 `useState`；`useRef` 刻意不響應。
- render 過程中不讀寫 `ref.current`（延遲初始化除外）；DOM ref 在 commit 才設定，在事件處理函式或 effect 裡讀。
- 一串節點：ref callback 登記進 `Map`，鍵用 id；React 19 的 ref callback 可以回傳清理函式。
- React 19 的 ref 是普通 prop，不必 `forwardRef`；`useImperativeHandle` 只公開動作，等於 `defineExpose`。
- `setState` 的下一行就要操作新出現的元素：用 `flushSync`（對應 `nextTick`）或 effect。

## G useReducer：把 state 怎麼變寫成純函式 {span=2}
```flow LR
[事件處理函式] -> [dispatch action]: 只說發生了什麼
[dispatch action] -> [reducer]: (state, action) => 下一個 state
[reducer] -> *render: 畫面用新的 state
```
| reducer 的規則 | 做法 |
|---|---|
| 不改傳進來的 state 和 action | 有變的那一層換新物件，沒變的沿用 |
| 不做副作用、不讀時鐘與亂數 | 時間與 id 由事件處理函式產生，放進 action |
| 什麼都沒變 | warn 回傳原本的 state，React 才能跳過更新 |
| 不合法的轉換 | 回傳原本的 state，不丟錯（reducer 在 render 時執行） |

action 寫成可辨識聯合，`default` 用 `never` 窮舉；名字描述發生了什麼（`added`），不是 `set_lines`。型別從 reducer 推導。`dispatch` 同樣是快照加批次；它的參考不變，effect 裡送 action 就不用依賴 state。獨立的簡單值用 `useState`，有規則、會一起變的用 `useReducer`，兩者可以混用。

## H 自訂 hook：共用邏輯，不共用 state
| | Vue composable | React 自訂 hook |
|---|---|---|
| 執行幾次 | setup 時一次 | 每次 render 都執行 |
| 回傳 | ref 物件，解構後仍會更新 | 這次 render 的值（快照） |
| 清理 | `onScopeDispose` | effect 回傳的清理函式 |

- 名稱以 `use` 開頭；每次呼叫各有一份 state（拿鐵按兩次 +，可頌不受影響）。
- 只在元件或 hook 的最上層、early return 之前呼叫；迴圈裡每一項要 state，就抽成元件。
- 回傳 tuple 要加 `as const`；給別人放進依賴的函式用 `useCallback` 加 updater。
- hook 的參數就是響應值，要列進依賴；收到的函式用 `useEffectEvent`。
- 外部資料（視窗寬度、`navigator.onLine`）用 `useSyncExternalStore`，`subscribe` 宣告在元件外。
- 測試用 `renderHook` 與 `act`，讀 `result.current`，不要先解構。
