---
title: Vue 3 階段 1：響應式原理：自己做一個
subtitle: 第 1～3 課一頁圖解：Proxy 與依賴追蹤、effect／track／trigger、ref 與 computed
cols: 3
theme: shadcn
課程: Vue 3 第 1～3 課
---
響應式就是讀取時記下誰依賴我、寫入時通知依賴我的人；ref、computed、scheduler 都是建在這三步上。[回 Vue 3 學習地圖](../index.html)

## A 依賴追蹤的三步 {span=2}
```flow LR
(effect 執行) -> [讀 cart.qty]: activeEffect 設成自己
[讀 cart.qty] -> [依賴表]: get trap 呼叫 track
[寫 cart.qty = 0] -> [依賴表]: set trap 呼叫 trigger
[依賴表] -> *重新執行: 讀過 qty 的 effect
*重新執行 --> [讀 cart.qty]: 重跑時再記一次依賴
```
命令式是改了資料自己去更新每個地方，漏一個就是 bug；宣告式只描述 畫面 = f(狀態)，由框架重算。框架要在「讀取」和「寫入」發生的那一刻插手。

## B 為什麼 ref 要 .value
JavaScript 攔截不到區域變數的讀寫，只能攔截物件屬性，所以單一的值要放進 `{ value }`。

| | Vue 2 | Vue 3 |
|---|---|---|
| 攔截方式 | `Object.defineProperty` | `reactive()` 用 Proxy |
| 新增、刪除屬性 | no 要 `Vue.set`／`Vue.delete` | ok 偵測得到 |
| 陣列索引、length | no 偵測不到 | ok 偵測得到 |
| 巢狀物件 | 建立時走遍整個物件 | 讀取時才包（lazy） |
| 改原物件 | 會觸發 | no 不觸發，只有經過 proxy 才追蹤 |

## C Proxy 與 Reflect 的規矩
- trap 裡用同名的 Reflect 函式完成原本的操作。
- set 要回傳 true：回傳 false 或 undefined，嚴格模式下那次寫入丟 TypeError；寫 `return Reflect.set(…)`。
- get 要傳 receiver：`Reflect.get(target, key, receiver)` 讓 getter 的 this 是 proxy，getter 裡的讀取才記得到。
- proxy 不等於原物件，`===` 是 false；拿到 reactive 之後原物件就別再用。
- 巢狀物件讀取時才包，用 WeakMap 快取，所以 `reactive(obj) === reactive(obj)`。
- 只能包物件：數字、字串包不了。

## D 依賴表：WeakMap → Map → Set
```tree list
targetMap `WeakMap<物件, …>` | 物件不再被用到時，連同依賴一起被回收
  cart 物件 `Map<屬性, …>` | 屬性可能是字串或 Symbol
    'qty' `Set<effect>` | 同一個 effect 讀兩次只記一次
    'price' `Set<effect>`
```
`targetMap.get(cart).get('qty')` 就是讀過 `cart.qty` 的 effect。換成 Map 會一直抓著用過的物件，造成記憶體洩漏。

## E 迷你版遇到的問題與修法 {span=2}
| 問題 | 症狀 | 修法 |
|---|---|---|
| 分支切換 | 不再用到的屬性改了，effect 仍白跑 | 重跑前用 `effect.deps` 把自己從所有 Set 移除，依賴每次重新收集 |
| trigger 遍歷時重跑 | Set 刪掉又加回，forEach 停不下來 | 先複製再遍歷：`[...dep].forEach(e => e.run())` |
| 巢狀 effect | 內層結束後 activeEffect 變空，外層後面的讀取沒記到 | `run` 裡存 `prev`，在 finally 還原外層 |
| 自我觸發 | `state.count++` 無限遞迴到 RangeError | trigger 跳過正在執行的 effect |
| 什麼時候重跑 | 連續寫入就連續重跑 | scheduler 接手；job 要呼叫 `run`，不能直接呼叫 `fn` |

```callout warn 追蹤只發生在同步執行期間
`setTimeout`、`await` 之後的讀取，activeEffect 已經不是這個 effect，不會被記下。要追蹤的值在 `await` 之前先讀出來，或改用明確列出來源的 `watch`。
```

## F 關於 ref 的三個細節
```kv cols=1
自己的 dep: ref 只有一個屬性，直接放一個 Set；讀 `.value` 時 track，寫 `.value` 時 trigger
同值不觸發: 用 `Object.is` 比較；`!==` 會讓存著 NaN 的 ref 每次寫入都觸發
物件值包成 reactive: `cup.value.qty++` 只讀了 `.value`，要靠 Proxy 追蹤 qty；整個換掉時新物件也要包
```
範本裡不用寫 `.value`，是 Vue 自動解包。

## G 計算屬性：computed 是 lazy 的 effect 加 dirty 旗標 {span=2}
```flow LR
[ref qty] -> [computed subtotal]: 改變時標記 dirty 並通知
[computed subtotal] -> [computed total]: 標記 dirty 並通知
[computed total] -> [effect 印出 total]: 通知
[effect 印出 total] --> [computed total]: 讀 .value 才重算
[computed total] --> [computed subtotal]: 讀 .value 才重算
```
建立時不算；依賴改變時 scheduler 只設 `dirty = true`；有人讀而且過期才重算。通知往下游推，計算由讀取的人往上游拉，沒人讀的那一段不會算。先設 dirty 再通知下游，順序反了下游會讀到舊快取。

這課的示範：`qty` 連續改兩次之間沒人讀，getter 只重算一次。Vue 3.4 起 computed 的值沒變時不通知下游；迷你版的做法是有下游就現在重算，用 `Object.is` 比較舊值。

## H 狀態、衍生、副作用各用什麼
| 需求 | 用什麼 | 例子 |
|---|---|---|
| 使用者輸入、伺服器資料 | `ref`／`reactive` | 備註欄文字、API 回來的訂單 |
| 從現有狀態算出一個值 | `computed` | 購物車總額、可以結帳 |
| 資料改變時對外做一件事 | `watch`／`watchEffect` | 呼叫搜尋 API、存 localStorage |

```callout err computed 的 getter 要是純函式
不發請求、不改別的狀態；`orders.value.sort()` 會改原陣列，要寫 `[...orders.value].sort()` 或 `toSorted()`。不要用 ref 加 watch 同步一個算得出來的值，也不要改 computed 回傳的物件。
```
