---
title: Vue 3 階段 5：狀態與資料
subtitle: 第 15～18 課一頁圖解：Pinia、API 層、非同步資料與快取、表單
cols: 3
theme: shadcn
課程: Vue 3 第 15～18 課
---
正本在前端的共用狀態放 Pinia，正本在伺服器的資料當成快取管理。所有請求經過一個 API 層，錯誤分成固定幾種，畫面照種類處理。[回 Vue 3 學習地圖](../index.html)

## A 狀態放哪裡
從最小範圍開始，不夠用才往外擴。

| 情境 | 放哪裡 |
|---|---|
| 只有一個元件用 | 元件內的 `ref` |
| 兄弟元件共用 | 提升到共同的父元件 |
| 一棵子樹的情境 | provide／inject |
| 整個 app 共用、跨頁面 | Pinia store：購物車、登入的使用者 |
| 要能分享、重新整理後還在 | 網址 query |
| 正本在伺服器 | 伺服器狀態快取：菜單、訂單紀錄 |

Pinia 比模組層級的 ref 多了：每個 app、每個 SSR 請求、每個測試各一份，還有 devtools 和外掛。

## B Pinia 的 setup store
| setup 函式裡寫的 | 變成 |
|---|---|
| `ref()`、`reactive()` | state |
| `computed()` | getter |
| `function` | action，可以是 async |

- 所有 state 都要 `return`，也不要包成 readonly：沒回傳的 devtools、外掛、SSR、測試都看不到。
- setup store 沒有內建 `$reset()`，自己寫。
- 元件裡 `storeToRefs(cart)` 取 state 和 getter，action 直接從 store 解構。
- 元件只呼叫 action，規則只寫一次。

## C 外掛與測試
```kv cols=1
pinia.use(plugin): 每建立一個 store 呼叫一次；在 app.use(pinia) 之後才生效
$subscribe: 底層是 watch，預設在下一個 microtask 通知；要立刻收到傳 flush sync
持久化: 只存需要的欄位、加版本號、讀回時驗證；不存 token、手機、地址
測 store: 每個測試 setActivePinia(createPinia())
測元件: createTestingPinia({ createSpy: vi.fn, initialState })，action 預設換成 spy
```
Pinia 4 只支援 ESM，`@vue/devtools-api` v8 要一起安裝；4.1 新增 `getStores()`。

## D API 層：fetch 不會因為 404 reject {span=2}
```flow LR
[元件] -> [端點函式 getMenu]
[端點函式 getMenu] -> [request]: 網址、標頭、token、逾時
[request] -> [(fetch)]: 從外面注入
[request] -> {2xx?}
{2xx?} -> [parse 驗證 unknown]: 是
{2xx?} -> [錯誤分類]: 不是
```
| `kind` | 什麼時候 |
|---|---|
| network | `fetch` 本身 reject：斷線、DNS |
| timeout | 超過時間沒回應 |
| canceled | 呼叫的人自己取消，畫面什麼都不用說 |
| http | 非 2xx，帶 `status`、`body` |
| validation | 422，帶 `fieldErrors` |
| unauthorized | 換 token 也救不回來的 401 |
| parse | 不是 JSON，或格式跟約定不同 |

204 沒有 body；伺服器的原始錯誤訊息不給使用者看。逾時與取消用 `AbortSignal.any([使用者的 signal, AbortSignal.timeout(ms)])`，signal 一定要傳給 `fetch`。

## E 401 刷新與重試 {span=2}
```sequence
participants: 購物車, 會員資料, API 層, 伺服器
購物車 -> 伺服器: GET → 401
會員資料 -> 伺服器: GET → 401
購物車 -> API 層: 開始刷新，存下 Promise
會員資料 -> API 層: 等同一個 Promise
API 層 -> 伺服器: refresh 只打一次
伺服器 --> API 層: 新的 access token
購物車 -> 伺服器: 重送一次 → 200
會員資料 -> 伺服器: 重送一次 → 200
note 購物車, 會員資料: 刷新失敗或重送仍是 401：登出一次
```
只有 401 才刷新，403 換 token 也沒用。自動重試只用在冪等的請求（依 RFC 9110：GET、HEAD、PUT、DELETE）和斷線、逾時、5xx；次數有上限，指數退避加抖動，重試只放在一層。POST 建立訂單靠 `Idempotency-Key` 讓重送安全，後端要配合。

## F 非同步狀態與伺服器快取
```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading'; previous?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
```
三個 ref 能組出 8 種組合，合理的只有 4 種；可辨識聯合讓不合法的組合寫不出來。參數改變時 abort 上一次，還要檢查 `signal.aborted` 丟掉過期的回應。

```flow LR
[抓取中] -> [新鮮]: 抓回來
[新鮮] -> [過期]: 過了 staleTime 或 invalidate
[過期] -> [抓取中]: 有人用，先給舊資料、背景重抓
[過期] -> [被清掉]: 沒人用超過 gcTime
```
一筆快取（一個 key）的生命週期：新鮮時直接用；過期時有人用就先給舊資料、背景重抓（SWR）；沒人用一段時間就從記憶體清掉。
同一個 key 同時的請求只送一個。多頁面共用伺服器資料時改用 Pinia Colada 或 TanStack Query。

## G 樂觀更新與輪詢
| 做法 | 要守的規則 |
|---|---|
| 樂觀更新 | 失敗回滾到伺服器確認過的值；連點以最後一次為準 |
| 不樂觀更新 | no 付款、下單、退款：顯示處理中，等伺服器確認 |
| 輪詢 | 上一次結束才用 `setTimeout` 排下一次；分頁隱藏時暫停；完成就停；卸載時清理 |
| SSE、WebSocket | warn 需要即時才值得，伺服器要維持長連線、處理重連 |

## H 表單：顯示時機、送出、可近用性 {span=2}
| 狀態 | 用來做什麼 |
|---|---|
| `values` | 送出的資料 |
| `touched` | 離開過欄位，決定錯誤何時出現 |
| `dirty` | 「放棄修改？」提醒 |
| `errors` | 由 values 用 computed 算出 |
| `submitting` | 送出中，擋住重複送出 |

錯誤在 `touched[field] || submitted` 後才顯示，改正就消失。驗證寫成純函式：「現在幾點」由參數傳入、一次回傳所有錯誤；zod 4 用 `refine` 加 `path` 把跨欄位錯誤掛到欄位，`z.flattenError` 取得 `fieldErrors`。

```sequence
participants: 瀏覽器, 伺服器
瀏覽器 -> 伺服器: POST /orders，Idempotency-Key k1
伺服器 -> 伺服器: 建立訂單 #81
伺服器 --> 瀏覽器: 回應逾時，沒收到
瀏覽器 -> 伺服器: 重送同一筆，同一把 k1
伺服器 --> 瀏覽器: 回傳第一次的結果 #81
note 瀏覽器: 成功後下一筆換新的 k2
```
- 送出函式開頭寫 `if (submitting.value) return`，處理寫在 `<form @submit.prevent>`；只靠 `disabled` 擋不住其他送出途徑。
- 非同步驗證：防抖、`checking` 狀態、過期請求 abort。
- 422 的 `fieldErrors` 放回欄位，其他錯誤顯示在表單層級。
- 明細列用 `crypto.randomUUID()` 當 key，指定新陣列給 model。
- `label for` 加 `useId()`、`aria-invalid`、`aria-describedby`，送出失敗時聚焦第一個錯誤欄位。
- 前端驗證只是為了體驗，伺服器一定要再驗一次。
