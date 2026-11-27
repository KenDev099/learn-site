---
title: React 階段 6：品質與期末專題
subtitle: 第 23～25 課一頁圖解：Testing Library 查詢、替換什麼、每種錯誤落在哪裡、無障礙與監控、期末專題檢查清單
cols: 3
theme: shadcn
課程: React 第 23～25 課
---
測行為，不測實作；每種錯誤都要回答「客人看到什麼、工程師怎麼知道」；期末專題從驗收條件開始，用驗收條件對照審查。[回 React 學習地圖](../index.html)

## A 測試怎麼找元素 {span=2}
Testing Library 排了優先順序：只用使用者拿得到的東西找。查表用，不用背。

| 順序 | 查詢 | 什麼時候用 |
|---|---|---|
| 1 | `getByRole(角色, { name })` | 幾乎所有東西：按鈕、連結、標題、列、`role="alert"` |
| 2 | `getByLabelText` | 表單欄位 |
| 3 | `getByPlaceholderText` | 只有 placeholder 時的退路 |
| 4 | `getByText` | 非互動的內容 |
| 5 | `getByDisplayValue` | 用欄位目前的值找 |
| 6 | `getByAltText`、`getByTitle` | 圖片的 alt、title |
| 7 | `getByTestId` | 最後才用：角色和文字都不適用時 |

找不到角色，常代表介面本身不無障礙。先修元件：圖示按鈕加 `aria-label`，測試找得到，螢幕閱讀器也唸得出來。

## B getBy、queryBy、findBy
| 前綴 | 找不到 | 用在 |
|---|---|---|
| `getBy…` | 丟錯 | 現在就該在畫面上 |
| `queryBy…` | 回傳 `null` | 檢查「不在畫面上」 |
| `findBy…` | 1000ms 後失敗 | 等一下才出現 |

找到好幾個也會丟錯，逼你說清楚。先用 `within(元素)` 縮小範圍，再找。

## C 什麼換、什麼不換 {span=2}
只換測試控制不了、或每次結果不同的東西。

| 依賴 | 換不換 | 怎麼換 |
|---|---|---|
| 網路（API、fetch） | ok 換 | 用 props 或 context 傳假的 API client；或 `vi.stubGlobal('fetch', …)` |
| 時間（`setTimeout`、`Date`） | ok 換 | `vi.useFakeTimers()` |
| 亂數 | ok 換 | 當參數傳進去，測試給固定值 |
| 自己的子元件 | no 不換 | 照樣 render，看最後的畫面 |
| React、hooks、自己的 store | no 不換 | 每個測試建立新的 store 或 Provider |

- 能用參數或 context 傳進去，就不要用 `vi.mock`。Vitest 5 規定它只能寫在檔案最外層。
- 假計時器：推進時間要包 `act`；這個專案裡配 `fireEvent`，用 `userEvent` 會卡到逾時。
- 開著假計時器時，`findBy` 也不會在 1 秒後失敗；改用 `act` 加 `getBy`／`queryBy`。

## D 測試有沒有用
兩個條件：元件壞掉時要失敗；換一種寫法但行為一樣時要通過。

| 寫法 | 抓不到什麼 |
|---|---|
| 只 render、只看「有東西」 | 任何行為錯誤 |
| 只寫 `toHaveBeenCalled()` | 送錯資料、送錯 id |
| 只測成功、只用預設值 | 驗證、錯誤、「選了別的」 |
| 只按第一列 | 不管按哪列都處理第一筆 |
| 只檢查時間到了之後 | 太早執行、計時器沒取消 |

故意把關鍵一行改錯，確認測試會紅。

## E 每種錯誤落在哪裡 {span=2}
React 19 依錯誤發生的位置，交給不同的地方。

| 錯誤發生在 | 客人看到 | 怎麼回報 |
|---|---|---|
| render、effect，外面有 Error Boundary | 那一塊換成 fallback | `createRoot` 的 `onCaughtError` |
| 同上，但沒有 Error Boundary | 整個 UI 被移除，空白頁 | `onUncaughtError` |
| React 自己恢復的錯誤（hydration 不一致） | 可能閃一下 | `onRecoverableError` |
| 事件處理函式、`setTimeout` | 什麼都沒變 | window 的 `error` 事件 |
| 沒人接的 Promise（async `onClick` 沒 catch） | 什麼都沒變 | window 的 `unhandledrejection` 事件 |
| 預期中的錯誤（驗證、庫存不足、404） | 自己 catch，放進 state | 通常不回報 |

- 三個 root 選項都收到 `(error, errorInfo)`，帶上 `errorInfo.componentStack`。設了選項就取代預設行為，不會重複送。
- `error` 事件的錯誤在 `event.error`，退回 `event.message`；`unhandledrejection` 的在 `event.reason`。
- `componentDidCatch` 和 `onCaughtError` 選一邊回報，通常統一在 root。

## F 事件處理函式：自己 catch
```flow LR
(按結帳) -> [catch]: await 失敗
[catch] -> [4xx 預期中]: 顯示伺服器的說明
[catch] -> [5xx、網路、程式錯誤]: 通用訊息並回報
```
- 不要再 `throw`：事件處理函式的錯誤 Error Boundary 攔不到。
- 顯示和 `capture` 要一起做；預期中的錯誤不回報，免得淹沒真正的問題。
- 回報帶 `componentStack`、release、操作脈絡，不帶個資；正式版本靠 source map 還原。
- 效能用 `web-vitals` 收 LCP、INP、CLS；INP 已取代 FID。

## G 無障礙：React 要多做的事 {span=2}
| 情況 | 要做的事 |
|---|---|
| 單頁應用換頁 | 每頁 render `<title>`，children 是一個字串，用樣板字串組成 |
| 換頁後焦點 | `pathname` 換了，才把焦點移到 `tabIndex={-1}` 的 `h1` |
| 只有圖示的按鈕 | `aria-label`，帶上是哪一個（「移除拿鐵」） |
| 狀態訊息 | `role="status"` 一直在，只換文字；動態出現的 `role="alert"` 例外 |
| 元素被移除 | 先決定焦點下一站：下一列，沒有就上一列，空了移到標題 |
| 說明文字 | `useId` 加 `aria-describedby` |

換頁焦點只比 `pathname`，不比 `location`，也不用「第一次」旗標：只改 `?q=` 就搶走焦點，StrictMode 又會讓旗標失效。自動檢查工具只看某一刻的 DOM，焦點要有人用鍵盤走一遍。

## H 期末專題：狀態放哪裡，不下兩次單
| 資料 | 放哪裡 |
|---|---|
| 分類 | 網址 `?category=`，網址是正本 |
| 搜尋關鍵字 | 元件的 `useState` |
| 菜單、訂單 | TanStack Query 的快取 |
| 購物車 | Zustand 加驗證過的 `persist` |
| 結帳表單 | 非受控欄位加 `useActionState` |

- `useActionState` 會排隊，不丟掉第二次送出。讓第二次「執行了也沒事」：購物車空了就停，加冪等鍵。
- 冪等鍵：網路斷線、5xx 沿用；4xx 或成功後換新。失敗不清空購物車；下單不做樂觀更新。
- 守衛和隱藏按鈕是體驗；伺服器再檢查才是安全。「可以取餐」等伺服器確認，按鈕名稱帶訂單（「王小明的訂單可以取餐」）。

## I 審查 PR 與自我檢查清單
審查是拿驗收條件一條一條對。同事的訂單狀態頁有六個問題：

| 問題 | 修法 |
|---|---|
| `queryKey: ['order']` 沒有 id | `['orders', id]` |
| effect 裡 `setCount` | 衍生值在 render 裡算 |
| `isError` 擺在前面 | 先看有沒有 data |
| `order.lines.sort(…)` 就地改 | `toSorted` |
| `role="status"` 加 `key` | 狀態區一直在，只換文字 |
| 明細沒有錯誤邊界 | Error Boundary 只包明細 |

lint 只抓得到 effect 裡 `setState` 這一個。找到的問題寫成測試，再用錯誤版本確認測試抓得到。

- 狀態：網址是正本就不另存；store 只存客戶端自己擁有的資料。
- 伺服器狀態：key 包含用到的每個變數；寫入後讓對的 key 失效。
- 錯誤處理：載入中、空狀態、錯誤加重試；預期外的回報。
- 可近用性：欄位有 label；重複的按鈕有分得出來的名稱。
- 效能：先量測再優化。
- 安全：`persist` 讀回來先驗證；token、手機、地址不放進 localStorage。
