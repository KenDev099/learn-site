---
title: Vue 3 階段 2：Vue 響應式實戰
subtitle: 第 4～6 課一頁圖解：ref 與 reactive 的陷阱、watch 與競態、排程器與 nextTick
cols: 3
theme: shadcn
課程: Vue 3 第 4～6 課
---
響應會在拿到普通值的那一刻斷線；要的是值用 computed，要對外做事才用 watch；Vue 改資料只排工作，DOM 在這一輪 flush 才更新。[回 Vue 3 學習地圖](../index.html)

## A 失去響應的三種寫法 {span=2}
| 寫法 | 為什麼斷線 | 修法 |
|---|---|---|
| `let { count } = state` | no 解構拿到當下的值 | `toRefs(state)`；只要一個屬性用 `toRef(state, 'count')` |
| `cart = reactive({ … })` 整個替換 | no 畫面追蹤的是第一個 proxy | 改用 `ref` 換 `.value`，或 `Object.assign(state, 新內容)` |
| `useBadge(state.count)` | no 函式收到的是數字 | 傳 ref 或 getter `() => state.count` |

| | `ref(value)` | `reactive(obj)` |
|---|---|---|
| 能放什麼 | 任何值 | 只能放物件、陣列、Map、Set |
| 整個換掉 | ok 換 `.value` | no 換掉就斷線 |
| 解構、傳給函式 | ok 傳的是 ref 本身 | no 拿到當下的值 |

預設用 `ref`；`reactive` 只用在不會被整個換掉的物件，例如一張表單的欄位。composable 回傳裝著 ref 的普通物件，呼叫端解構也不斷線。

## B 自動解包：什麼時候不用寫 .value
| 情況 | 會解包嗎 |
|---|---|
| 範本裡 `<script setup>` 頂層的 ref | ok 會 |
| reactive 物件的屬性 | ok 會，`state.c.value` 反而是 `undefined` |
| reactive 陣列的元素、Map 的值 | no 不會 |
| 範本裡普通物件的 ref 拿去運算 | no `{{ order.total + 1 }}` 顯示 `[object Object]1` |
| `{{ }}` 的結果剛好是 ref | ok 只是顯示上的方便 |

## C 不需要深層響應的資料
```kv cols=1
shallowRef: 大量資料只會整批替換；直接改內容不通知，要換掉整個 `.value`
markRaw: 圖表、地圖、SDK 實例；有 `#private` 欄位的實例放進 reactive 會丟 TypeError；要在建立的那一行就標記
readonly: 只給看不給改，修改集中在函式裡
toRaw: 暫時繞過追蹤；改原物件畫面不會更新
```
不要為了「可能比較快」把所有狀態都改成 shallow，先量測再優化。

## D 怎麼寫 watch：來源與選項
要的是一個值用 `computed`；資料變了要通知 API、localStorage、網址這類外部目標，才用 `watch`。

| 來源 | 什麼時候觸發 |
|---|---|
| ref | `.value` 被換掉 |
| getter `() => state.qty` | 回傳值改變（`Object.is`），預設不深層 |
| reactive 物件 | 任何一層改變，自動深層 |
| `state.qty` | no 傳進去的是值，Vue 警告 Invalid watch source |

`immediate` 第一次的舊值是 `undefined`；`deep` 每次走過整棵物件，3.5 起可以給數字；`once`（3.4 起）只執行一次。`watchEffect` 只追蹤同步執行期間讀到的資料，有 await 的副作用用 `watch` 寫清楚來源。

## E 競態：舊回應蓋掉新結果 {span=2}
```sequence
participants: 搜尋框, watcher, API
搜尋框 -> watcher: keyword = 拿
watcher -> API: 請求 A，登記 onWatcherCleanup(abort)
搜尋框 -> watcher: keyword = 拿鐵
watcher -> watcher: 重跑前先呼叫清理，請求 A 被 abort
watcher -> API: 請求 B
API --> watcher: B 的結果寫進 results
API --> watcher: A 以 AbortError reject
note watcher: signal.aborted 就 return，不當成錯誤
```
```callout warn 清理函式要在第一個 await 之前登記
放在 await 之後，Vue 只印警告、沒登記上，舊請求照樣蓋掉新結果。3.5 以前的寫法是 callback 的第三個參數 `onCleanup`。防抖也是同一招：登記 `clearTimeout`。
```
同步建立的 watcher 隨元件停止；在 `setTimeout` 裡、或 async 函式中 await 之後才建立，就不屬於元件（`<script setup>` 最上層的 await 例外），要留著 `watch()` 回傳的把手，在 `onUnmounted` 呼叫。3.5 起還有 `pause()`／`resume()`。交給外部的資料用 `structuredClone(toRaw(form))`。

## F 一輪 flush 的順序 {span=2}
```flow LR
(同步程式改資料) -> [queueJob]: 去重，只排一次 flush
[queueJob] -> [父 pre watcher]: microtask
[父 pre watcher] -> [父元件更新] -> [子 pre watcher] -> [子元件更新]
[子元件更新] -> [post callback]: 全部元件更新完
[post callback] -> *nextTick resolve
group 依元件 id 由小到大: 父 pre watcher, 父元件更新, 子 pre watcher, 子元件更新
```
pre watcher 穿插在元件更新之間：每個元件的 pre watcher 在父元件更新之後、自己的元件更新之前執行；post callback（`flush: 'post'` 的 watcher、`onUpdated`）等全部元件更新完才跑，看到新 DOM。

| flush | 什麼時候 | 看到的 DOM |
|---|---|---|
| `'pre'`（預設） | 父元件更新之後、自己的元件更新之前 | 自己的舊 DOM |
| `'post'` | 這一輪所有元件更新之後 | ok 新 DOM：捲動、量尺寸、交給圖表 |
| `'sync'` | 每次改動當下，沒有批次 | warn 舊 DOM；很少需要，迴圈 push 1000 筆就跑 1000 次 |

改完資料要讀新 DOM 用 `await nextTick()`，不用 `setTimeout(fn, 0)`；只讀資料不需要等。

## G 測試裡要等什麼
| 寫法 | 等什麼 |
|---|---|
| `await wrapper.trigger()`、`setValue()` | 這一輪 DOM 更新 |
| `await nextTick()` | 這一輪 DOM 更新 |
| `await flushPromises()` | 已經 resolve 的 Promise callback 跑完 |
| `await vi.advanceTimersByTimeAsync(ms)` | 用了假計時器時；`flushPromises()` 在假計時器下會卡到逾時 |

不要寫 sleep：先想清楚等的是 DOM、Promise 還是計時器。

## H 無限更新
```callout err Maximum recursive updates exceeded
在 `onUpdated` 或 watch 裡改自己依賴的資料就會形成迴圈。Vue 3.5.44 開發模式下同一個工作同一輪執行超過 100 次就報錯；正式環境沒有這道防線，頁面會卡住。
```
- 衍生的值改用 `computed`，不要回寫。
- 一定要在更新後寫入時，只在值真的不同時才寫，讓迴圈收斂。
- 「watch A 改 B、watch B 又改 A」改成資料只有一個來源。
