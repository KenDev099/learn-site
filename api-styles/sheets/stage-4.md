---
title: API 風格與整合 階段 4：gRPC 與 Protobuf
subtitle: 第 8～9 課一頁圖解：.proto 與程式碼產生、線上格式與相容規則、四種 RPC、狀態碼、deadline 與串流
cols: 3
theme: shadcn
課程: API 風格與整合 第 8～9 課
---
.proto 是服務之間唯一的契約，線上只認欄位編號。gRPC 出事時的行為比寫出伺服器更難：選對狀態碼，deadline 往下傳剩餘預算，取消一路傳到資料庫。[回 API 風格與整合 學習地圖](../index.html)

## A 一份 .proto，兩邊產生程式碼 {span=2}
```flow LR
*[inventory.proto] -> [gen 的 _pb.js 與 .d.ts]: buf generate
*[inventory.proto] -> [inventory.pb.go]: buf generate
[gen 的 _pb.js 與 .d.ts] -> [訂單服務 Node]
[inventory.pb.go] -> [庫存服務 Go]
[訂單服務 Node] -> [庫存服務 Go]: protobuf 位元組
```
- package 帶版本（`coffee.inventory.v1`），檔案路徑跟 package 對應；欄位名 lower_snake_case，產生的 TypeScript 是 camelCase。
- buf：`buf lint` 統一寫法、`buf generate` 用 protoc-gen-es 產生 `.js` + `.d.ts`、`buf breaking` 比對上一版。不手改 `gen/`。
- protobuf-es 都是「函式 + Schema」：`create`、`toBinary`、`fromBinary`、`toJson`、`isFieldSet`。給瀏覽器或 log 用 `toJson`，不要自己 `JSON.stringify`。

## B 型別與預設值
| proto | TypeScript | 注意 |
|---|---|---|
| `int32` | number | 數量、新台幣整數元 |
| `int64` | bigint | 不能直接 JSON.stringify |
| `float`、`double` | number | no 不用在金額 |
| `enum` | 數字 enum | 第一個值是 `XXX_UNSPECIFIED = 0` |
| `oneof` | `{ case, value }` | 最多一個有值 |
| `repeated`、`map` | 陣列、物件 | 不能加 optional |

```callout warn 0 和「沒給」分不出來
proto3 不送等於預設值的欄位，讀到 0 不等於對方說 0。0 有意義的欄位（補貨點、折扣）設計時就加 `optional`，上線後才補，舊資料仍然分不出來。
```

## C 線上格式：只有編號沒有名稱
| 位元組 | 意思 |
|---|---|
| `0a` | 1 << 3 \| 2：欄位 1，LEN |
| `01 32` | 長度 1，內容 "2" |
| `10 03` | 欄位 2，VARINT：3 |
| `18 6e` | 欄位 3，VARINT：110 |

這是 `OrderItem { product_id: "2", quantity: 3, unit_price_twd: 110 }`。tag = 編號 << 3 \| wire type；varint 每個位元組放 7 位元，300 編成 `ac 02`。舊程式不認得的欄位依 wire type 跳過。這課的示範訂單：protobuf 52 位元組，JSON 259。

## D 相容規則 {span=2}
| 改動 | 二進位 | JSON／產生的程式碼 | 正確做法 |
|---|---|---|---|
| 新增欄位 | ok 舊程式跳過 | ok | 新程式要處理預設值 |
| 刪除欄位 | warn 當下安全 | warn 當下安全 | `reserved` 編號與名稱 |
| 改名 | ok | no 名稱變了 | 新欄位 + 舊欄位 `[deprecated = true]`，過渡期兩個都填 |
| 改型別、改編號 | no 改編號壞；改型別多數壞 | no | 新增新欄位；編號上線後固定 |
| enum 新增值 | warn 舊程式讀到不認得的數字 | warn `fromJson` 預設丟錯 | 當成 UNSPECIFIED；讀 JSON 的一方加 `ignoreUnknownFields` |

| buf breaking 類別 | 擋下什麼 |
|---|---|
| FILE（buf 1.75 預設） | PACKAGE 的全部，再加檔案層級的改動 |
| PACKAGE | 刪除任何欄位都擋，就算 reserved 了 |
| WIRE_JSON | 改名擋；刪欄位 reserved 編號與名稱就放行 |
| WIRE | 只擋二進位不相容；改名放行 |

不確定就用嚴的。相容性檢查看不到語意：含稅改未稅要新增一個名稱說清楚的欄位。

## E 四種 RPC 與 Connect-ES
| 種類 | 寫法 | 咖啡店的例子 |
|---|---|---|
| unary（預設用它） | `(A) returns (B)` | 查庫存、保留庫存 |
| server streaming | `(A) returns (stream B)` | 店內看板訂閱庫存變化 |
| client streaming | `(stream A) returns (B)` | 倉庫掃描進貨，最後回總數 |
| bidirectional | `(stream A) returns (stream B)` | 少用，經過某些代理會不通 |

```kv cols=1
伺服器: router.service(InventoryService, 實作) 加 http2.createServer(connectNodeAdapter(…))
client: createClient(InventoryService, createGrpcTransport({ baseUrl }))
HTTP/2: 一條連線多工；結果狀態放在 trailers，瀏覽器不能直接呼叫原生 gRPC
```

## F 狀態碼決定呼叫端會不會重試
| 狀態碼 | 什麼時候用 | 重試 |
|---|---|---|
| `INVALID_ARGUMENT`（3） | 請求本身不對 | no 改請求才有用 |
| `NOT_FOUND`（5） | 商品不存在，不要回 0 | no |
| `FAILED_PRECONDITION`（9） | 庫存不夠 | no 狀態改變前不行 |
| `ABORTED`（10） | 併發衝突 | warn 從更高一層重做 |
| `RESOURCE_EXHAUSTED`（8） | 配額用完、被限流 | warn 等一段時間 |
| `UNAVAILABLE`（14） | 暫時連不上、正在重啟 | ok 退避後重試，非冪等操作仍要小心 |
| `DEADLINE_EXCEEDED`（4） | 期限到了 | warn 看操作是否冪等 |
| `PERMISSION_DENIED`（7）／`UNAUTHENTICATED`（16） | 沒有權限／沒有或無效的憑證 | no |
| `INTERNAL`（13） | bug | no 通常不行，要有人去查 |

成功失敗都是 HTTP 200，結果在 trailers。丟 `ConnectError(訊息, Code.X)`；一般 Error 會變成 INTERNAL 或 UNKNOWN。每個 RPC 會回哪些碼寫進 .proto 註解。

## G Deadline 是整條呼叫鏈的預算 {span=2}
```sequence
participants: App, 訂單服務, 庫存服務, 資料庫
App -> 訂單服務: 整個請求的預算 300 ms
note 訂單服務: 自己用掉 120 ms
訂單服務 -> 庫存服務: timeoutMs = 剩下的 180 ms
note 庫存服務: ctx.timeoutMs() 約 180
庫存服務 -> 資料庫: 查詢帶著 ctx.signal
note 訂單服務, 庫存服務: deadline 到或 client 取消時 ctx.signal abort，查詢跟著停
```
- gRPC 預設沒有 deadline；client 設 `timeoutMs`，送出的是相對的 `grpc-timeout`。
- 呼叫下游用 `ctx.timeoutMs()` 再扣掉自己處理回應的時間，不是每層各訂固定值。
- 剩下太少就直接回 `DEADLINE_EXCEEDED`；signal 造成的錯誤原樣往外丟，不包成 INTERNAL。
- `DEADLINE_EXCEEDED` 不代表伺服器沒做：Reserve 可能已經扣完，重試要有 idempotency key。只讀的 GetStock 重試沒有副作用。
- grpc-js 的 deadline 是絕對時間點：`Date.now() + 300`，不是 300。

## H 串流、metadata 與除錯
```callout ok server streaming 的寫法
async generator 每 yield 送一筆；`events.on(changes, 'change', { signal: ctx.signal })` 先監聽、再送目前值，取消時監聽會被移除。AbortError 不是 ConnectError，signal 已 abort 時改丟 `ctx.signal.reason`。
```
- 每次部署串流都會斷：訂閱端退避加隨機後重新訂閱；長串流要設 deadline 或送心跳。
- metadata 放 `x-request-id`、`authorization`，用 interceptor 統一加；interceptor 不放商業邏輯，log 不印整包 metadata。
- 除錯用 `buf curl` 或 grpcurl；伺服器反射等於公開 API 結構，正式環境通常只在內網開。
