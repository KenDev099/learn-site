---
title: API 風格與整合 階段 2：GraphQL 基礎
subtitle: 第 2～5 課一頁圖解：schema 與查詢、resolver 與 mutation、N+1 與 DataLoader、分頁與錯誤
cols: 3
theme: shadcn
課程: API 風格與整合 第 2～5 課
---
schema 是前後端的契約，每個欄位背後都是一個 resolver。查詢先驗證再執行；清單底下的關聯要批次載入，會一直新增的列表用 keyset 分頁，回應永遠看 data 和 errors。[回 API 風格與整合 學習地圖](../index.html)

## A 一份查詢的三步 {span=2}
```flow LR
[查詢文字 + 變數 JSON] -> [解析 parse]: 語法對不對
[解析 parse] -> [驗證 validate]: 跟 schema 對得上嗎
[驗證 validate] -> *[執行 execute]: 這時才呼叫 resolver
[解析 parse] --> [只有 errors]: 失敗
[驗證 validate] --> [只有 errors]: 失敗
[執行 execute] -> [data 加上 errors]
```
前兩步失敗時，任何函式都不會被呼叫：拼錯、漏參數、變數型別不符都在執行前擋下。回應永遠是 `{ data, errors }`，HTTP 200 不代表沒有錯誤。

| 情況（graphql-yoga 6.0.1 本機實測） | `Accept: application/json` 或沒給 | `application/graphql-response+json` |
|---|---|---|
| 拼錯欄位（驗證失敗） | warn 200 + errors | 400 + errors |
| 變數型別不符 | 400 + errors | 400 + errors |
| 執行時出錯 | warn 200 + data + errors | warn 200 + data + errors |

## B Schema 與查詢寫法
| 寫法 | 清單可為 null | 元素可為 null |
|---|---|---|
| `[Product]` | 可以 | 可以 |
| `[Product!]` | 可以 | 不行 |
| `[Product]!` | 不行 | 可以 |
| `[Product!]!` | 不行 | 不行，空陣列可以 |

- SDL：物件型別、純量（Int、Float、String、Boolean、ID）、enum、input，入口是 `Query`。
- `!` 是承諾，加了就很難拿掉；`product(id)` 找不到回 null，型別不加 `!`。
- 值用變數傳，不拼字串；別名同時查同一欄位兩次；fragment 重用欄位；每個操作都取名。
- 內省讓 GraphiQL、IDE、codegen 知道 schema；測試用 `yoga.fetch` 不必開 port。

## C Resolver：由上往下，一個欄位呼叫一次 {span=2}
```flow LR
[Query.order] -> [Order.items]: 回傳值變成 parent
[Order.items] -> [OrderItem.product]: 清單每一筆各自往下
[Order.items] -> [quantity 用預設 resolver]: 回傳 parent 的同名欄位
```
```kv cols=1
parent: 上一層的回傳值，例如用 parent.customer_id 查顧客
args: 這個欄位收到的參數，已驗證、轉好型別
context: 每個請求一份，放 db 與 viewer
info: 結構資訊（路徑、選了哪些子欄位），少用
```
resolver 負責轉換：`ordered_at` 轉 `orderedAt`、用 id 查出整個關聯物件（不是回傳 id）、算出 `total`（用下單當下的 `unit_price`）。
```callout err 目前使用者放在模組變數
同一個程序同時處理很多請求，await 之後讀模組變數可能讀到別人寫的值，王小明看到陳美華的訂單。放進 context，resolver 只從 context 讀。
```

## D Mutation 與預期中的失敗
| 做法 | 客戶端 |
|---|---|
| 丟錯 | warn 從 errors 找代碼，一般 Error 還會被遮罩 |
| `userErrors` 欄位 | ok 有型別；order 和 userErrors 哪個有值靠約定 |
| union 結果型別（本課程） | ok 用 `__typename` 分支，codegen 強迫處理每一種 |

`placeOrder(input: PlaceOrderInput!): PlaceOrderResult!`，`PlaceOrderResult = OrderPlaced | OutOfStock | InvalidQuantity`。errors 留給非預期錯誤和沒登入。

- Mutation 頂層欄位依序執行，但不共用交易；要整批成功就設計成一個 mutation 收整批。
- 下單邏輯放服務層：先全部檢查、再全部寫入，檢查到寫入在同一個交易裡。

## E Null 傳播
```flow LR
[product: Product! 丟錯] -> [OrderItem! 元素非空]: 往上
[OrderItem! 元素非空] -> [items 清單非空]: 往上
[items 清單非空] -> *[order: Order 可為 null]: 停在這
```
一個品項的商品查不到，整張訂單變成 null；`errors[].path` 一律指向丟錯的欄位。關聯欄位讓它可為 null，錯誤才局部化；已上線的輸出欄位拿掉 `!` 是破壞性變更。

## F N+1 與 DataLoader {span=2}
| 寫法 | 這課的示範：`orders(last: 5)` 的 SQL 句數 |
|---|---|
| 每個欄位各查各的 | no 18 句 = 1 + N + N + 品項數 |
| DataLoader，每層一句 `WHERE id = ANY($1)` | ok 4 句，不管查幾張訂單；批次查的欄位要有索引 |

DataLoader 在同一個時機收集所有 `load(key)`，一次呼叫 batch 函式，同一個請求裡相同的 key 只查一次。
```kv cols=1
長度相同: 回傳陣列長度等於 keys，不然整批失敗
順序相同: 先放進 Map，再用 keys.map 依順序取出
找不到放 null: 一對多回傳陣列的陣列，沒有就放 []
每個請求一份: 在 context 建立；模組層級共用會洩漏權限、讀到舊值
改了資料: `clear(id)` 再 `prime(id, 新值)`，不用 `{ cache: false }` 繞過
```
每層仍至少一句；每組各取前幾筆用 LATERAL 或視窗函式；形狀固定的地方直接 JOIN。用測試斷言句數，上線後記錄每個請求的句數。

## G 分頁：OFFSET 與 keyset
| | OFFSET | keyset |
|---|---|---|
| 定位方式 | 第幾筆 | 上一頁最後一筆的排序鍵 |
| 翻頁途中新增或刪除 | no 重複或漏掉 | ok 不受影響 |
| 很後面的頁 | no 越後面越慢 | ok 配合複合索引一樣快 |
| 跳頁、總頁數 | ok 簡單 | warn 不能直接跳頁、很難算總頁數 |

`WHERE (ordered_at, id) < ($2, $3) ORDER BY ordered_at DESC, id DESC LIMIT 每頁筆數 + 1`。排序鍵要唯一（加 id），多拿一筆判斷有沒有下一頁。

Relay Connection：`edges { cursor node }`、`pageInfo { hasNextPage endCursor }`、`first`／`after`；`first` 要有上限。游標是不透明的 base64url 字串，伺服器逐層驗證，壞掉回 `BAD_USER_INPUT`。

## H 錯誤分三類 {span=2}
| 類別 | 例子 | 客戶端看到 |
|---|---|---|
| 請求錯誤 | 拼錯欄位、`first: "abc"` | 只有 errors，執行前擋下 |
| 預期中的錯誤 | 沒登入、沒權限、游標無效 | `GraphQLError` 保留訊息與 `extensions.code` |
| 非預期錯誤 | SQL 錯誤、bug、下游掛了 | `Unexpected error.`、`INTERNAL_SERVER_ERROR`，原錯誤寫進 log |

| 代碼 | 前端通常怎麼做 |
|---|---|
| `UNAUTHENTICATED` | 導到登入頁，或換新 token 再重送 |
| `FORBIDDEN` | 顯示沒有權限，不要重試 |
| `BAD_USER_INPUT` | 顯示訊息；游標無效時從第一頁重新載入 |
| `INTERNAL_SERVER_ERROR` | 顯示通用錯誤，可以讓使用者重試 |

```callout warn 錯誤遮罩
graphql-yoga 6.0.1 預設開啟。自訂 `maskError` 只記被遮罩的錯誤；不要關掉遮罩除錯，不要在 resolver catch 後回 null。監控依 `extensions.code` 和操作名稱計數，只看 5xx 會漏掉。
```
