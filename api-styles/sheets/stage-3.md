---
title: API 風格與整合 階段 3：GraphQL 上線：防護與客戶端
subtitle: 第 6～7 課一頁圖解：欄位層級授權、深度與成本限制、persisted operations、codegen、客戶端快取與 HTTP 快取
cols: 3
theme: shadcn
課程: API 風格與整合 第 6～7 課
---
GraphQL 的型別互相連通，查詢由客戶端決定。授權要在每條路徑生效，執行前要擋下太貴的查詢。前端用 codegen 拿到型別；客戶端快取先用 document cache，只有公開資料才交給 CDN。[回 API 風格與整合 學習地圖](../index.html)

## A 換一條路就拿到別人的訂單 {span=2}
```flow LR
Query -> [order(id) 只有這裡有檢查]
Query -> [product(id)]
Query -> [customer(id)]
[order(id) 只有這裡有檢查] -> Order
[product(id)] -> [Product.orders]
[customer(id)] -> [Customer.orders]
[Product.orders] -> Order
[Customer.orders] -> Order
Order --> [internalNote 只有店員]
Order --> [Order.customer 的 email 只有店員]
```
- BOLA：拿得到不屬於你的物件（別人的訂單）。
- BOPLA：物件可以看，某些欄位不該給你（email、internalNote）。

授權放在資料存取層，或集中成幾個函式（`visibility.ts`），由每個型別與欄位的 resolver 呼叫。

## B 咖啡店的授權規則
| 情況 | 處理 |
|---|---|
| 直接要求訂單，沒登入 | `UNAUTHENTICATED` |
| 直接要求別人的訂單 | `FORBIDDEN`，order 是 null |
| 列表裡有看不到的訂單 | 濾掉，不報錯 |
| 非店員查 email、internalNote | 回 null，欄位要可為 null |

欄位規則寫在欄位自己的 resolver：只在 `Query.customer` 清掉 email，`Order.customer` 走預設 resolver 照樣洩漏。角色只看伺服器端 session 查到的 viewer，`x-role` 標頭一律不看。授權寫成測試矩陣：每個角色 × 每條路徑。

## C 讓伺服器做太多事
| 形式 | 例子 | 深度限制擋得住嗎 |
|---|---|---|
| 深層巢狀 | schema 有環，一直往下繞 | ok 擋得住 |
| 大量清單 | 三層各 `first: 50`，最多 125,000 個 item | no 只有 3 層 |
| 別名放大 | 500 個別名查 `menu` | no 只有 1 層 |
| 批次請求 | 一個 HTTP 請求帶 100 份操作，每分鐘 60 個請求的限流變成 6,000 份 | 不靠深度限制，見下方批次設定 |

深度限制是便宜的第一道門，衡量工作量要靠成本計算。Yoga 6 預設不接受批次請求；開了 `batching: true` 預設上限 10 份，每份都要算進限流與成本。
`useDepthLimit({ maxDepth: 6 })` 在驗證階段擋下，回 `GRAPHQL_VALIDATION_FAILED`；`__` 開頭的內省欄位不算。

## D 成本計算：自己寫的 ValidationRule {span=2}
| 這課練習的 schema（`menu` 預設 20、`orders` 10、`items` 5） | 計算 | 成本 |
|---|---|---|
| `{ menu(first: 20) { name price } }` | 20 × (1 + 2) | 60 |
| `{ menu { name } orders { id } }` | 20 × 2 + 10 × 2（預設值） | 60 |
| `{ orders(first: 50) { items(first: 10) { product { name } } } }` | 50 × (1 + 10 × (1 + 2)) | 1,550 |
| 500 個別名的 `menu(first: 20) { name }` | 500 × 20 × 2 | 20,000 |

規則：欄位 1 分、有 first 的欄位整個乘以 first、巢狀相乘、別名各算、fragment 與 inline fragment 展開、互相引用的 fragment 不能讓規則當掉。超過回 `QUERY_TOO_COMPLEX`，extensions 帶 cost。
```callout warn 變數與 Yoga 的驗證快取
`menu(first: $n)` 的值在 variables。Yoga 快取驗證結果的鍵不含 variables，所以成本規則在 `onExecute` 用這次的 variables 執行 `validate`。上線先只記錄成本一兩週，再定上限；成本也可以拿來限流。
```

## E Persisted operations：只執行登記過的查詢
```sequence
participants: 前端建置, 伺服器, App
前端建置 -> 伺服器: 部署雜湊與查詢文字的清單
App -> 伺服器: 只送 sha256Hash 加 variables
伺服器 --> App: 在清單裡，執行
App -> 伺服器: 送查詢文字
伺服器 --> App: PersistedQueryOnly
```
| 客戶端 | 防護 |
|---|---|
| 第一方（自己的 App、官網） | ok 白名單最強；清單先部署，舊雜湊只加不刪 |
| 公開 API | no 不能用白名單，靠深度、成本限制與依成本限流 |

`allowArbitraryOperations` 只看伺服器設定，不看請求標頭；查清單用 Map。關內省不是安全邊界。CSRF 防護要求簡單請求帶自訂標頭，沒帶回 403；改用 GET 時一定要開。

## F 前端：codegen 與 urql
```flow LR
[schema.graphql] & [src 的 .graphql 操作] -> codegen
codegen -> *[TypedDocumentNode]: data 與變數自動有型別
codegen -> [persisted-documents.json]: 給伺服器的白名單
```
schema 改了，前端在建置時就報錯。urql：一個 App 一個 client，exchange 依順序處理操作。

| requestPolicy | 快取有資料時 | 適合 |
|---|---|---|
| `cache-first`（預設） | 直接用快取 | 不常變的資料 |
| `cache-and-network` | 先給快取，背景重查 | 列表頁 |
| `network-only` | 一律送請求 | 重新整理按鈕 |
| `cache-only` | 用快取，沒有就不送 | 確定查過、離線 |

`toPromise()` 跳過 stale 結果；查詢預設用 GET。

## G 下單後列表沒更新：兩種客戶端快取 {span=2}
| | document cache（urql 預設） | 正規化快取（graphcache） |
|---|---|---|
| 鍵 | 查詢 + 變數，整份存 | `__typename:id`，例如 `Order:42` |
| 改了已存在的物件 | warn 含同型別的查詢全部失效、重查 | ok mutation 回傳 id 與改過的欄位，寫進同一份，所有畫面一起更新、不用重查 |
| 新增一筆 | no 空列表裡沒有 Order 不會失效，加 `additionalTypenames: ['Order']` | no 要在 `updates` 寫 `cache.invalidate` |
| 設定 | 不用懂 schema | 沒有 id 的型別要設 keys |

先用 document cache，發現很多地方手動重查同一批資料才換正規化快取。登入狀態改變時建立新的 client，避免看到上一個人的訂單。

## H HTTP 快取與回應快取
GraphQL 難用 HTTP 快取：POST、同一個網址、回應依使用者不同。
| 資料 | 做法 |
|---|---|
| 公開的菜單 | ok persisted operation + GET + `Cache-Control: public` |
| 個人資料 | warn `private` 或 `no-store`，交給客戶端快取 |
| 個人資料設成 public | no CDN 只看網址，把一個人的資料給另一個人 |

```kv cols=1
session: 一定要從驗證過的身分取；回傳固定值等於所有人共用一份
ttl: 不設時預設 Infinity，改成 0 再用 ttlPerSchemaCoordinate 白名單
invalidateViaMutation: mutation 要回傳物件和 id 才會失效
```
經過別的服務或直接改資料庫的修改，回應快取不會知道；ttl 上限先跟 PM 確認。
