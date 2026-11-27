---
title: Vue 3 階段 3：元件如何運作
subtitle: 第 7～11 課一頁圖解：render 與虛擬 DOM、key、生命週期、props 與 emits、v-model、slots 與 Teleport
cols: 3
theme: shadcn
課程: Vue 3 第 7～11 課
---
元件的 render 是一個 effect，比對新舊 vnode 後只改差異；元件之間資料往下、事件往上，畫面用 slot 交給使用者，DOM 位置用 Teleport 搬走。[回 Vue 3 學習地圖](../index.html)

## A 範本怎麼變成畫面 {span=2}
```flow LR
[template] -> [render 函式]: 編譯，Vite 建置時做一次
[render 函式] -> [vnode 樹]: 執行時讀到的資料被追蹤
[vnode 樹] -> [(真正的 DOM)]: mount
[資料改變] -> [render 函式]: 排進佇列，下一輪重跑
[vnode 樹] -> *patch: 新舊兩棵樹比對
*patch -> [(真正的 DOM)]: 只改差異
```
vnode 是 `{ type, props, children }` 這樣的普通物件；`v-for` 編譯成 map、`v-if` 編譯成三元運算、`@click` 變成 `onClick` prop。編譯器的三種最佳化：Cache Static、Patch Flags、Tree Flattening，所以範本比手寫 `h()` 容易最佳化。虛擬 DOM 的價值是讓宣告式寫法夠快，不是比精準的手動 DOM 操作更快。

## B 怎麼選 key
patch 判斷「同一個節點」看 type 和 key。沒有 key 或用 index，就按位置就地更新。

| key | 結果 |
|---|---|
| 資料庫 id、商品編號 | ok 刪除、排序後備註跟著品項走 |
| index | no 刪除第一列後，輸入框的字跑到別的品項 |
| `Math.random()` | no 每次全部卸載重建，狀態和焦點消失 |
| 重複的 key | no 開發模式警告 Duplicate keys |
| 沒有 id 的新品項 | ok 建立時產生一次 `crypto.randomUUID()` 存起來 |

換 key 可以重置元件：`<OrderForm :key="orderId" />`。

## C 條件渲染：v-if、v-show 與 v-html
| | `v-if` | `v-show` |
|---|---|---|
| 不成立時 | 只留一個註解節點 | `display: none` |
| 切換成本 | 高，子元件狀態重置 | 低，只改 CSS |
| 適合 | 很少改變、隱藏時要真的卸載 | 頻繁開關 |

`v-if` 和 `v-for` 不寫在同一個元素：`v-if` 先執行，讀不到 `v-for` 的變數，先用 computed 過濾。

```callout err v-html 會執行使用者的腳本
`{{ }}` 和屬性綁定都被當成文字或屬性值；`v-html` 等於設定 innerHTML。使用者提供的內容不放進 `v-html`，一定要顯示 HTML 就先用可靠的套件清理。
```

## D 生命週期的順序 {span=2}
```sequence
participants: 父元件, 子元件
父元件 -> 父元件: setup、onBeforeMount
父元件 -> 子元件: 渲染子元件
子元件 -> 子元件: setup、onBeforeMount
子元件 -> 子元件: onMounted
子元件 --> 父元件: 子樹建好
父元件 -> 父元件: onMounted，拿得到子元件
== 卸載 ==
父元件 -> 父元件: onBeforeUnmount
父元件 -> 子元件: 卸載
子元件 -> 子元件: onBeforeUnmount、onUnmounted
父元件 -> 父元件: onUnmounted
```
每使用一次元件就跑一次 setup，各有一份狀態。setup 時還沒有 DOM，SSR 時 `onMounted` 不會跑，碰 DOM、開計時器放進 `onMounted`。鉤子要在 setup 裡同步註冊，`setTimeout`、`await` 之後註冊永遠不會執行。

## E 自己開的東西自己收
| 在 onMounted 建立 | 在 onUnmounted 清理 |
|---|---|
| `setInterval` | `clearInterval(id)` |
| `addEventListener('resize', fn)` | `removeEventListener`，同一個 fn |
| `ResizeObserver` | `disconnect()` |
| `WebSocket` | `close()` |
| 第三方圖表、地圖 | `destroy()`／`dispose()`，實例用普通變數不放進 `ref()` |

`useTemplateRef('名字')`（3.5）掛載後才有值；子元件用 `defineExpose` 只公開動作。`<KeepAlive>` 裡的元件用 `onDeactivated`／`onActivated`。測試用假計時器，`unmount()` 後 `vi.getTimerCount()` 要是 0；測 focus 要 `attachTo`。Options API 的 data／methods／mounted 對應 ref／函式／onMounted，看得懂就好。

## F 資料往下、事件往上：props 與 emits
```flow LR
[Cart 擁有 lines] -> [CartLine]: props line
[CartLine] --> [Cart 擁有 lines]: emit changeQuantity
```
- 不改 props，也不改 props 裡物件的屬性：第二種 Vue 不警告，卻改到父元件的資料。
- 只有「初始值」才複製成本地狀態，prop 取名 `initialNote`。
- 3.5 起解構 props 用 `=` 給預設值；監聽要寫 `watch(() => productId, …, { immediate: true })`。
- emits 用具名 tuple 宣告，範本監聽用 kebab-case；測試用 `emitted()`。
- 沒宣告的屬性和事件會透傳到根元素；根元素不對時用 `inheritAttrs: false` 加 `v-bind="$attrs"`。只加 `v-bind="$attrs"`、沒關 `inheritAttrs`，屬性同時落在外框和內層，click 處理函式被呼叫兩次。

## G 展開 v-model {span=2}
```flow LR
[父元件 qty = ref 2] -> [QuantityInput]: prop modelValue
[QuantityInput] --> [父元件 qty = ref 2]: 事件 update:modelValue
```
| 寫法 | 展開成 |
|---|---|
| 文字 `<input v-model>` | 聽 `input`，組字中不更新；`.lazy` 改聽 `change` |
| checkbox、radio、select | 聽 `change` |
| 元件 `v-model` | `modelValue` prop 加 `update:modelValue` 事件 |
| `v-model:sugar` | `sugar` prop 加 `update:sugar` 事件 |
| `defineModel()`（3.4 穩定） | 回傳 ref：讀是 prop，寫是 emit；父元件沒用 v-model 時變成本地狀態 |

限制與轉換放在 `set` 轉換器；初始值由父元件決定，不靠 `default`；model 是物件時指定新物件，不改屬性。

```callout warn 這些情況不用 v-model
刪除前要確認、要先經過非同步驗證、事件本身比值重要（送出、加入購物車）：用明確命名的事件。
```

## H 把畫面交出去：slots 與 Teleport
| 要解決的問題 | 用什麼 |
|---|---|
| 傳資料、設定 | props |
| 外框固定，中間畫面由使用者決定 | slot |
| 畫面由使用者決定，但要元件內部的資料 | 作用域 slot `#item="{ product, add }"` |
| 只有邏輯沒有畫面 | composable |

slot 內容在父元件的作用域編譯。用 `$slots`／`useSlots()` 判斷有沒有傳，沒傳就不渲染外框。

`<Teleport to="body">` 只改 DOM 位置，脫離 overflow 和堆疊脈絡，元件關係不變；3.5 加了 `defer`；SSR 時避免以 body 為目標。對話框要 `role="dialog"`、`aria-modal`、`aria-labelledby`，開啟時聚焦、Esc 關閉、關閉後焦點回到原元素。
