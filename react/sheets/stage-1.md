---
title: React 階段 1：心智模型：從 Vue 到 React
subtitle: 第 1～4 課一頁圖解：重新 render、JSX 與元件、state 快照、受控表單
cols: 3
theme: shadcn
課程: React 第 1～4 課
---
Vue 追蹤讀取、寫入時通知；React 不追蹤，你呼叫 set 函式，它就把元件函式重新呼叫一次。state 是這次 render 的快照，要換新值就給它新的物件。[回 React 學習地圖](../index.html)

## A 一次更新的三步 {span=2}
```flow LR
(set 函式 或 初次 render) -> [trigger]: 觸發
[trigger] -> [render]: 呼叫元件函式，拿到畫面描述
[render] -> [commit]: 跟上一次比，只改有差異的 DOM
[commit] --> *畫面
```
render 是重新算一次，commit 才改 DOM，兩者不一樣：render 了但結果相同，DOM 就不動。render 次數多不等於畫面慢，先量測再優化。

## B Vue 與 React：誰知道要更新
| | Vue 3 | React 19 |
|---|---|---|
| 怎麼知道要更新 | 追蹤讀取，寫入時通知讀過的元件 | 你呼叫 set 函式，React 安排一次 render |
| 元件的程式碼 | `<script setup>` 只執行一次 | 元件函式每次 render 都從頭執行 |
| 衍生值 | `computed` | 在函式裡直接算 |
| 直接改物件內部 | ok Proxy 攔截得到 | no React 不知道，畫面不更新 |
| 父元件更新時的子元件 | props 有變才更新 | warn 預設全部跟著 render，DOM 沒差異就不動 |

元件要是純函式：同樣的 props 與 state 回傳同樣的畫面，render 時不改外部變數。Strict Mode 在開發模式多呼叫一次來抓不純的寫法，不要為了少一行 log 拿掉它。

## C state 是快照 {span=2}
set 函式不改這次 render 的變數，只決定下一次 render 的值。一個事件裡的更新會批次處理，只 render 一次。

| 寫法（`stamps` 從 0 開始） | 下一次 render 的值 |
|---|---|
| `setStamps(stamps + 1)` ×3 | no 1：三行都是「設成 1」 |
| `setStamps(s => s + 1)` ×3 | ok 3：updater 依序收到 0、1、2 |
| `setN(n + 5)` 再 `setN(n => n + 1)` | 6：先換成 5，再加 1 |

```callout warn await 之後的 set 幾乎都該用 updater
`await save()` 之後的 `stamps` 是按下當時那次 render 的值。新值依賴舊值（加減、切換、往陣列加一筆）用 updater；跟舊值無關（輸入框內容、API 回來的資料）直接傳值。
```

## D 不可變更新：給 React 一個新的參考
React 只用 `Object.is` 比較新舊 state；同一個參考就當沒變，連子元件一起跳過。

| 要做的事 | 會改原陣列 | 回傳新陣列 |
|---|---|---|
| 加一筆 | no `push`、`unshift` | ok `[...arr, item]` |
| 刪除 | no `splice`、`pop` | ok `filter` |
| 改其中一筆 | no `arr[i].qty = 2` | ok `map`，符合的那筆回傳新物件 |
| 排序、反轉 | no `sort`、`reverse` | ok `toSorted`、`toReversed` |

巢狀資料只複製改到的那條路徑，其餘沿用原本的參考。updater 裡也不能改舊物件，Strict Mode 會讓數量加兩次。

## E state 放哪裡、何時重設
```kv cols=1
提升 state: 兄弟不共用，移到最近的共同父元件；props 往下傳資料，函式 props（onXxx）往上通知，沒有 emit
能算的不存: 件數、合計、錯誤訊息從 state 在 render 時算；存 id，不存商品物件的複本
貴的初始值: `useState(() => loadDraft(id))`，傳函式本身，不要傳呼叫結果
重設 state: state 跟著元件在樹上的位置走；換資料要重來，給外層 `key={id}`
```
```callout err 不要用這幾種方式重設
用 effect 把 state 改回來（畫面會閃）、`key={Math.random()}`、把元件定義在別的元件裡面：三者都會讓 state 在不該清的時候被清掉。
```

## F Vue 範本換成 JSX {span=2}
| Vue 範本 | JSX |
|---|---|
| `{{ product.name }}` | `{product.name}` |
| `:disabled="soldOut"` | `disabled={soldOut}` |
| `@click="select(c.id)"` | `onClick={() => select(c.id)}` |
| `<slot />` | `{children}` |
| 具名 slot | 型別是 `ReactNode` 的 prop |
| `v-if`、`v-for` | 提早 return、三元、`&&`；`filter` 再 `map` |

- JSX 轉成 `jsx(type, props)` 呼叫，結果是普通物件；屬性用 DOM 名稱（`className`、`htmlFor`）。
- 元件名稱大寫開頭；props 唯讀，預設值寫在解構；型別只靠 TypeScript。
- `onClick={onAdd(id)}` 在 render 時就呼叫了，要傳 `() => onAdd(id)`。
- 不想多一層 DOM 用 Fragment；在 map 裡要寫 `<Fragment key>`，簡寫不能寫 key。

## G 條件與 key 的兩個坑
```callout err count && … 在 count 是 0 時畫出「0」
`&&` 左邊是 falsy 時回傳它本身，數字 0 會被畫出來。左邊用比較式（`count > 0 &&`）或改三元。
```
| key 的寫法 | 結果 |
|---|---|
| ok 資料的 id | 刪除、排序後，輸入框的字跟著正確的那一筆 |
| no 索引 | 刪掉中間一筆，字留在原位置，跑到別的資料上 |
| no 名稱 | 同名會撞號 |
| no `Math.random()` | 每次 render 都重建，輸入框的字不見 |

key 不是 prop，元件裡讀不到。

## H 表單：受控、非受控與組字 {span=2}
受控元件就是手寫的 v-model：`value`（checkbox、radio 是 `checked`）加同步更新 state 的 `onChange`。

| | 受控 | 非受控 |
|---|---|---|
| 值在哪裡 | React state | DOM |
| 打字時 | 每個字都重新 render | 不 render |
| 適合 | 邊打邊算、即時驗證、程式要改欄位 | 只在送出時才需要值 |
| 讀值、重設 | state；`setState(initial)` | `FormData`；`type="reset"` 或換 key |

- `e.target.value` 一律是字串：select 要轉數字，checkbox 讀 `checked`，數字欄位在 state 存字串。
- 沒有 `.trim`、`.number`、`.lazy`：state 存原文，顯示或送出時再轉。
- 有 `value` 沒有 `onChange` 欄位變唯讀；`value` 不能是 `undefined` 或 `null`。
- 送出掛在 `<form onSubmit>` 並 `preventDefault`；其他按鈕寫 `type="button"`。錯誤在 render 時算，只有「按過送出」是 state；處理函式開頭自己擋重複送出。
- 中文組字：React 組字中照樣觸發 `onChange`。輸入框的字與拿去搜尋的關鍵字分開存，在 `compositionend` 補一次；Enter 先檢查 `isComposing`。
