---
title: Vue 3 階段 4：重用與型別
subtitle: 第 12～14 課一頁圖解：composable、provide 與 inject、依賴注入、vue-tsc、泛型元件
cols: 3
theme: shadcn
課程: Vue 3 第 12～14 課
---
有狀態邏輯抽成 composable，子樹情境資料用 provide／inject 交下去。元件介面用型別宣告，讓 vue-tsc 在 CI 擋下錯誤用法。[回 Vue 3 學習地圖](../index.html)

## A 怎麼設計一個 composable {span=2}
| 面向 | 建議 | 理由 |
|---|---|---|
| 輸入 | 會變的參數用 `MaybeRefOrGetter`；選項多時收一個選項物件 | 呼叫端不用先包 ref |
| 輸出 | ref 組成的普通物件；狀態 `readonly`，修改透過函式 | 可以解構；修改集中好追查 |
| 依賴 | API client、`now()`、storage 從參數傳入或 inject | 測試換成假物件 |
| 副作用 | 每個註冊都配一個清理 | 元件內外都清乾淨 |
| 大小 | 一個 composable 做一件事，大的用小的組起來 | 好測、好重用 |

```callout warn toValue 要在 getter 裡呼叫
在函式開頭 `const id = toValue(customerId)` 只讀一次，之後固定。寫成 `watch(() => toValue(customerId), load, { immediate: true })` 才會追蹤。`unref()` 只處理 ref，遇到 getter 不會呼叫。
```
composable 以 `use` 開頭，狀態靠閉包，每呼叫一次一份。邏輯只在一個元件用而且很短時，不用抽。

## B 清理：onScopeDispose
| | 在元件 setup 裡 | 在 `effectScope().run()` 裡 |
|---|---|---|
| `onUnmounted(fn)` | ok 卸載時執行 | no 警告，永遠不執行 |
| `onScopeDispose(fn)` | ok 卸載時執行 | ok `scope.stop()` 時執行 |
| watch 的清理函式 | ok 下次執行前、卸載時 | ok 下次執行前、stop 時 |

`effectScope().run()` 讓 composable 在元件外使用，也是測試 composable 的方法；`stop()` 後 watch 不再執行，computed 被讀取時仍會重算。

## C 狀態寫在哪、在哪裡呼叫
```flow LR
[店內 useCartBadge] -> [模組最外層 count]: 共用一份
[外帶 useCartBadge] -> [模組最外層 count]
```
ES module 只執行一次，最外層的 ref 被所有呼叫共用：看不出來、測試互相污染、SSR 時會外洩到別的顧客。預設寫在函式裡；整個 app 共用的狀態交給 Pinia。

composable 只在 setup 頂層同步呼叫。await 之後、條件裡、事件處理裡呼叫，清理會掛不上；用到 `onMounted`、`inject` 的一定要在元件裡。

## D 怎麼找值：provide／inject {span=2}
```flow TB
[App provide 門市] -> [Layout 不知道門市]
[Layout 不知道門市] -> [MenuPage 不知道門市]
[MenuPage 不知道門市] -> [ProductList 不知道門市]
[ProductList 不知道門市] -> *PriceTag: inject 直接拿
```
- 只往祖先找：兄弟元件 provide 的值拿不到，回傳 `undefined`。
- 最近的祖先優先，中間元件可以替自己的子樹蓋掉。
- 看不到自己 provide 的值。
- 要在 setup 同步呼叫；物件或昂貴的預設值用 `inject(key, () => new Map(), true)`。
- provide 不會讓值變響應式：要交 ref、reactive 或 computed。

## E 包成 provideX 與 useX
```ts
const CURRENT_STORE: InjectionKey<Ref<Store>> = Symbol('CurrentStore')

export function useCurrentStore() {
  const store = inject(CURRENT_STORE, null)
  if (!store) throw new Error('useCurrentStore() 必須在 provideCurrentStore() 之下使用')
  return store
}
```
- `InjectionKey<T>`：Symbol 不會撞名，provide 和 inject 共用同一個型別；字串 key 拿到 `unknown`。
- 預設值給 `null`：沒有提供者時由你的錯誤訊息說明原因。
- key 不 export，別的檔案繞不過這兩個函式。
- 交出 `readonly(store)` 加 `switchStore()`，修改只發生在提供者。

## F 依賴注入與工具選擇
| 工具 | 適合 |
|---|---|
| props／emits | 直接父子、中間層本來就要用 |
| provide／inject | 一棵子樹的情境資料：門市、Tabs 的選取；app 層級的 API client、設定 |
| Pinia | 整個 app 共享、跨頁面：購物車、登入的使用者 |

外掛在 `install(app)` 裡 `app.provide(KEY, client)`；測試用 `global.plugins` 或 `global.provide` 換成假的。client 不要存在模組層級變數：同一個程式裡有兩個 app 時，後安裝的會蓋掉先安裝的。純函式直接 import。

複合元件 Tabs／Tab：Tabs 擁有選取狀態並 provide，每個 Tab inject 後註冊自己；再加上 `role`、`aria-selected`、roving tabindex 和方向鍵。

## G 誰在檢查型別
| 工具 | 擦掉型別 | 檢查型別 |
|---|---|---|
| Vite、`vite build` | ok | no |
| Vitest | ok | no |
| `tsc` | — | warn 看不懂 .vue |
| `vue-tsc` | — | ok 含 .vue 的 script 和範本 |

這課的示範：測試全部通過，`vue-tsc --noEmit` 仍抓到範本裡的 `prise` 打錯字和 emit 參數型別錯。CI 要跑 type-check。

```callout warn TypeScript 與 vue-tsc 一起升級
vue-tsc 3.3.14 需要 TypeScript 6（6.0.3）；TypeScript 7.0 的 npm 套件沒有它要的 JavaScript 編譯器 API。兩個都鎖版本，lockfile 進 git。
```

## H 元件介面的型別與泛型 {span=2}
| 介面 | 型別寫法 |
|---|---|
| props | `defineProps<{ product: Product }>()` |
| emits | `defineEmits<{ add: [id: number, qty: number] }>()` |
| v-model | `defineModel<number>('qty')` |
| slots | `defineSlots<{ option(props: { item: Product }): any }>()`（3.3+） |
| template ref | .vue 檔固定字串自動推論；composable 裡 `InstanceType<typeof X>`；泛型元件用 `ComponentExposed` |

```flow LR
[:items 是 Product 陣列] -> [T = Product]: TS 推論
[T = Product] -> [v-model 是 Product 或 null]
[T = Product] -> [#option 的 item 是 Product]
```
泛型元件寫 `<script setup lang="ts" generic="T extends { id: number }">`，只有一種資料時不用泛型。執行時宣告 `defineProps({ product: Object })` 讓屬性變 `any`。用 `@ts-expect-error`、`<!-- @vue-expect-error -->` 確認錯的用法真的會報錯。tsconfig 開 `strict`、`verbatimModuleSyntax`。
