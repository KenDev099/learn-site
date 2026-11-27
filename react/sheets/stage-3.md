---
title: React 階段 3：元件設計與型別
subtitle: 第 10～13 課一頁圖解：組合、Context、元件的型別、Portal、Suspense 與 Error Boundary
cols: 3
theme: shadcn
課程: React 第 10～13 課
---
React 沒有 slot 語法，組合靠 props、函式與 context；Context 一換值，所有讀它的元件都重新 render；型別讓錯誤用法編譯時就失敗；Portal、Suspense、Error Boundary 管元件樹的邊界。[回 React 學習地圖](../index.html)

## A 組合方式怎麼選 {span=2}
| 要解決的問題 | React | Vue 對應 |
|---|---|---|
| 傳資料、設定 | props | props |
| 外框固定，中間畫面由使用的人決定 | `children`、型別是 `ReactNode` 的 prop | slot、具名 slot |
| 畫面由使用的人決定，但要元件內部的資料 | render prop | 作用域 slot |
| 一組元件共用 state，使用的人自由排版 | compound components 加 context | `provide`／`inject` |
| 父元件想管值，也想讓人不管就能用 | `value`／`defaultValue`／`onChange` | `defineModel` |
| 薄包裝要接受原生屬性 | `...rest` 展開 | 自動透傳、`$attrs` |
| 只有邏輯，沒有畫面 | 自訂 hook | composable |

跨很多層才用 context；兩三層用 props，中間層只排版就用 `children`。

## B 插槽與 render props
- 插槽型別用 `ReactNode`，不要用 `string`；有沒有傳用 `!= null`（`&&` 會讓 0 不見或印出「0」）；沒傳就連外框都不 render。
- render prop 是普通函式：元件把資料當參數交出去（`renderItem(product, { add })`），`<ul>` 與 `key` 留在元件裡。
- render prop 裡不能呼叫 hook：hook 記在外層元件上，項目數一變就出錯（`Rendered more hooks…`）。要 state 就回傳一個元件。
- 先問「真的有第二種長相嗎」，再抽 render prop。

## C compound components：用 context 共用 state {span=2}
```flow LR
[Tabs: useState(value)] -> [Tabs 提供 context]: 每個 Tabs 各有一份
[Tabs 提供 context] -> [Tab 咖啡]: use 讀，不管隔幾層
[Tabs 提供 context] -> [Panel 咖啡]: 沒選中的回傳 null
[Tab 咖啡] -> *點擊: 呼叫 select 改 Tabs 的 state
```
| 做法 | 結果 |
|---|---|
| no `Children.map` 加 `cloneElement` | 只碰得到直接的子元素；中間包一層 `<span>` 就壞 |
| ok context | 使用的人自由排版，Tab 與 Panel 直接找到最近的 Tabs |

沒選中的 Panel 回傳 `null`，裡面的元件不會被呼叫；用 `hidden` 藏起來，元件照樣執行。context 預設值給 `null`，在 `useXxx()` 讀到就丟錯。

## D 元件對外的介面：受控與透傳
- 同一個元件兩種用法：`value !== undefined` 就聽 `value`，否則用 `defaultValue` 起始的自己的 state；兩種都在事件裡 `onChange?.(next)`。
- 不用 effect 把 `value` 複製進 state，也不用 effect 呼叫 `onChange`；不要中途切換模式。
- React 不自動透傳：沒用到的 props 就消失，薄包裝用 `...rest`。

| 寫法 | 結果 |
|---|---|
| 預設值放 `rest` 之前 | ok 使用的人可以覆蓋 |
| 預設值放 `rest` 之後 | no 使用的人傳的被蓋掉 |
| `className` | warn React 不合併，自己組；沒傳時樣板字串會變 `"btn undefined"` |
| 自己的 props 留在 `rest` | no 變成 DOM 屬性，或布林值警告 |

## E Context 三步
```kv cols=1
建立: `createContext(預設值)`，在元件外面呼叫；context 物件本身不存資料
提供: React 19 寫 `<Ctx value={…}>`；`Ctx.Provider` 是舊寫法
讀取: `use(Ctx)`，往上找最近的 Provider，看不到自己 render 的那一個；沒有 Provider 才用預設值
```
- 一個功能一個檔案：context 不 export，只公開 Provider 元件與 `useXxx()`。
- 預設值給 `null`，沒有 Provider 就丟錯；不要拿總店、空函式、正式環境的 API client 當預設值。
- state 放在 Provider 元件裡，不要放模組層級的變數（並排的 Provider 會共用，改了也不會 render）。
- Vue 提供 ref，後代讀 `.value` 被追蹤；React 的 value 是快照，要換值就讓 Provider 重新 render。

## F Context 的代價：value 換了，誰會 render {span=2}
| 情況 | 結果 |
|---|---|
| Provider 的 `value` 用 `Object.is` 比較，換了 | warn 所有讀它的元件都 render，`memo` 擋不住 |
| `value={{ staff, login }}` 寫在 JSX | no 每次 render 都是新物件，讀的元件跟著 render |
| 整個 `value` 用 `useMemo` 包住 | ok 依賴沒變就是同一個參考 |
| 只把裡面的函式包 `useCallback` | no 外層物件每次都新 |
| Provider 用 `children` 收子樹 | ok state 改變時，不讀 context 的元件被跳過 |
| 常變與不常變放同一個 value | no 只要 `dispatch` 的元件也跟著 render |

```callout ok 拆成兩個 context
`lines` 與 `dispatch` 各一個 context；`dispatch` 的參考不變，直接當 value，不要再包成 `{{ dispatch }}`。依變化頻率拆。
```
Vue 追蹤到欄位；React 以整個 value 為單位，要「只訂閱一部分」就用有 selector 的 store（第 14 課）。context 對應 `provide`／`inject`，不是 Pinia。官方文件把這歸為效能優化，先量再拆。context 也是依賴注入：用 Provider 換掉 API client，effect 把注入的值列進依賴。

## G 元件的型別
| 介面 | Vue 3 | React 19 |
|---|---|---|
| props | `defineProps` | 函式參數的型別 |
| 事件 | `defineEmits` | `onAdd: (id: number) => void` |
| v-model | `defineModel` | `value` 加 `onChange` 兩個 props |
| slot | `defineSlots` | `children: ReactNode`、render props |
| 泛型 | `generic="T"` | `function Select<T>(props)` |

- Vite、Vitest 只擦掉型別；檢查靠 `tsc -b`，CI 要真的跑。`.tsx` 不需要 `vue-tsc`。
- 包裝原生元素：`ComponentProps<'button'> & { 自己的 props }`，含 `ref`；不要用 `HTMLAttributes`（沒有 `disabled`、`type`）。
- 每種情況帶不同資料：props 寫成辨識聯合，錯的組合寫不出來；`default` 用 `satisfies never` 窮舉。
- 抽出來的處理函式自己標事件型別（`ChangeEvent<HTMLInputElement>`、`SubmitEvent<HTMLFormElement>`），讀 `currentTarget`。
- `useState<T | null>(null)`、`useRef<HTMLInputElement>(null)` 初始值推論不出來時寫型別參數；不用 `!` 或 `as` 蓋過。
- 泛型元件：`readonly T[]`、「沒選」寫成 `T | null`、不需要就不加 `extends`；推論不出來寫 `<Select<Product> />`，箭頭函式寫 `<T,>`。

## H Portal、Suspense 與 Error Boundary {span=2}
| | 解決什麼 | 要點 | Vue 對應 |
|---|---|---|---|
| `createPortal(jsx, domNode)` | DOM 被祖先的 `overflow` 裁掉 | 只改 DOM 位置；state、context、事件冒泡照元件樹 | `Teleport`（事件照 DOM 樹） |
| `Suspense` 加 `use(promise)` | 把「載入中」交給外層 | 元件暫停，最近的 `<Suspense>` 顯示 fallback；`lazy` 也會觸發 | `Suspense`（Vue 仍是實驗性） |
| Error Boundary | render 時的錯誤讓整個 UI 消失 | 只能用 class 元件（或 react-error-boundary）；`getDerivedStateFromError` 算 state，`componentDidCatch` 回報 | `onErrorCaptured` |

```callout err Error Boundary 攔不到的錯誤
事件處理函式、`setTimeout` 等非同步 callback、邊界自己、伺服器端渲染。事件裡的錯誤自己 `try/catch`，存進 state 顯示。
```
- 傳給 `use` 的 Promise 要快取、在 render 之前建立（事件、loader，或不會暫停的父元件）；在會暫停的元件裡每次 render 都是新的請求。
- state 裡放「最新的 Promise」，舊的晚回來也沒人讀，沒有競態。
- `use` 的三種結果：等待給 Suspense、失敗給 Error Boundary、成功自己畫。重試要換新的 Promise 再 `reset`；外部條件變了用 `key` 重設邊界。
- Suspense 只包住真的在等的部分，包太大等一筆資料整個面板都換成 fallback。
- 對話框：`useId` 給標題 id，effect 依賴只放 `open` 來聚焦，清理函式把焦點還給原按鈕，Esc 寫在對話框的 `onKeyDown`。
