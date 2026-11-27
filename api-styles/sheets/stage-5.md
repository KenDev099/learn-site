---
title: API 風格與整合 階段 5：契約與整合架構
subtitle: 第 10～12 課一頁圖解：契約演進與破壞性變更檢查、Pact、API gateway 與 BFF、瀏覽器呼叫 gRPC、期末專題
cols: 3
theme: shadcn
課程: API 風格與整合 第 10～12 課
---
契約要在合併前跟線上版本比，零件之間的接法決定出事時留下什麼。gateway 管入口，BFF 管組合，規則留在擁有資料的服務。[回 API 風格與整合 學習地圖](../index.html)

## A 改名不是「改」：先擴充、再收斂 {span=2}
```timeline h
新增 | priceTwd | 新舊欄位都能查
標記 | price 加上 @deprecated(reason) | reason 寫替代欄位；舊查詢照常執行
看使用量 | 舊版 App 還有人用嗎 | schema registry 或 resolver 指標；行動 App 可能要好幾個月
移除 | price | 使用量歸零之後
```
示範事故：後端把 `price` 改名，後端測試查新欄位、前端測試用自己的 mock，兩邊都通過，上線後菜單頁空白。端對端測試抓得到，但慢、不穩、太晚，也看不出是誰改壞的。改型別一樣：新增 `state: OrderStatus!`，舊的 `status` 標 deprecated。

## B 在 CI 擋下破壞性變更
| findSchemaChanges 分類 | 例子 | CI |
|---|---|---|
| BreakingChangeType | `FIELD_REMOVED`、`REQUIRED_ARG_ADDED`、`ARG_CHANGED_KIND` | no 擋下 PR |
| DangerousChangeType | `VALUE_ADDED_TO_ENUM`、`TYPE_ADDED_TO_UNION` | warn 提醒、通知前端 |
| SafeChangeType | `FIELD_ADDED`、輸出欄位變非空 | ok 放行 |

- 輸出變非空安全，參數變必填破壞：交給函式判斷，不用文字比對 SDL。
- 有操作清單時，用 `visit` + `TypeInfo` 找出被使用的欄位，沒人用的移除就不擋。
- proto：`buf breaking --against '.git#branch=main'`，類別依呼叫方式選 WIRE、WIRE_JSON、FILE。
- 需要破壞性變更時，PR 寫清楚影響、由負責人核准，不註解掉檢查。

## C Pact：把前端的假設交給後端驗證 {span=2}
```sequence
participants: App 的 CI, Pact mock server, pact 檔, 菜單 API 的 CI
App 的 CI -> Pact mock server: 真的 fetchMenu() 送出請求
Pact mock server --> App 的 CI: 依互動描述回應
App 的 CI -> pact 檔: 測試通過，寫出契約
菜單 API 的 CI -> pact 檔: Verifier 讀取
菜單 API 的 CI -> 菜單 API 的 CI: state handler 準備資料，重播請求給真的伺服器、比對回應
```
- matcher 描述依賴的形狀與型別（`like`、`integer`、`eachLike`），不寫死值；寫死會讓 provider 一改資料就失敗。
- provider 驗證失敗要讓 CI 失敗，不 catch；state handler 名稱跟 `given(…)` 一字不差。
- 它不是功能測試，只涵蓋寫進契約的互動。REST、webhook 這類沒有強制 schema 的 API 收益最大。
- 小團隊、單一 repo：CI 跑 schema 比對、pact 檔放 repo 就夠。多 repo、各自部署時才導入 Pact Broker（can-i-deploy）與 schema registry。

## D API gateway 與 BFF
| | API gateway | BFF |
|---|---|---|
| 位置 | 所有外部請求的入口 | 為某一種前端聚合下游 |
| 做什麼 | TLS、路由、認證第一道檢查、限流、產生 request id、log 與指標 | 組合與轉換；GraphQL 伺服器常扮演這個角色 |
| 不做什麼 | no 商業邏輯；物件層級授權 | no 價格、折扣這類規則 |
| 誰擁有 | 多半是維運或平台團隊 | 通常是前端團隊，也負責它半夜壞掉 |

gateway 驗完 JWT 只知道是誰；訂單屬於誰只有訂單服務知道。只有一個前端、一個服務時不需要 BFF。

## E 可靠的聚合：菜單加庫存 {span=2}
```flow LR
(BFF 收到請求) -> [記下 deadline]: 例如 now 加 500 ms
[記下 deadline] -> [菜單服務]: 同時出發，必要
[記下 deadline] -> [庫存服務]: 同時出發，timeoutMs 是剩餘預算減 20
[菜單服務] & [庫存服務] -> [Promise.allSettled]
[Promise.allSettled] -> *[菜單照常，available 是 null]: 庫存失敗時帶 INVENTORY_UNAVAILABLE
[Promise.allSettled] --> [整個欄位失敗]: 菜單失敗時
```
- 附加資料的欄位要可為 null：`available: Int!` 會讓 null 一路傳到 data。
- 錯誤給固定訊息與代碼，內部主機名稱只寫進 log；降級時一定要記錄，不然下游掛一整天沒人發現。
- 剩餘預算算出來小於等於 0 就不呼叫：Connect 的 `timeoutMs` 小於等於 0 代表不設逾時。

| 標頭 | 轉送給下游 |
|---|---|
| `x-request-id` | ok 一個請求只產生一次，每個下游呼叫共用 |
| `authorization` | ok 原樣轉送，下游自己做授權 |
| `cookie` | no 可能有 session 憑證 |
| `content-type`、`host` | no 會蓋掉 gRPC 請求自己的值 |

## F 瀏覽器怎麼呼叫 gRPC
fetch 讀不到 HTTP trailers，原生 gRPC 用不了。
| 做法 | 代價 |
|---|---|
| gRPC-Web | 多數伺服器要在前面放 Envoy 之類的代理 |
| Connect 協定 | 伺服器要用 Connect 實作；咖啡店的 POS 選它 |
| grpc-gateway | Go 生態，多一個程序；產生 REST/JSON |

Connect unary：`POST /coffee.inventory.v1.InventoryService/GetStock`，JSON body；預設值會被省略，沒有 available 就當 0。錯誤是非 200 加 `{ code, message }`，HTTP 狀態碼被好幾個 code 共用，要讀 code。

federation 解決多團隊共用一個 graph 的組織問題，代價是 router 的維運；咖啡店只有一個前端團隊，不需要。

## G 期末專題：需求寫成數字
| 非功能需求 | 數字 |
|---|---|
| 資料庫負載 | 最深的訂單歷史查詢最多 6 句 SQL |
| 查詢防護 | 深度 6、成本 1000；正式環境只接受登記過的操作 |
| 延遲預算 | 整個請求 500 ms |
| 降級 | 庫存服務掛掉時菜單仍可顯示 |
| 正確性 | 不超賣；重送只算一次；失敗不留半張訂單 |

句數只跟查詢層數有關：這個專案實測 4 句，店員查多位顧客時 5 句。`node contracts/run.ts` 四步：graphql-schema、buf-breaking、pact-consumer、pact-provider；baseline 是線上版本，失敗要以非 0 結束。

## H 下單：先預留，再寫入 {span=2}
| 順序 | 庫存服務掛掉時 | 資料庫寫入失敗時 |
|---|---|---|
| 先建訂單，再 Reserve | no 多一張沒有庫存的訂單，店員照單做 | 沒事 |
| 先 Reserve，成功再建訂單 | ok 什麼都沒留下，回 InventoryUnavailable | warn 庫存扣了沒有訂單，可用補償補救（專題不做） |

```kv cols=1
庫存服務: 記住 idempotency_key 與第一次的回應；Reserve 逾時重試時靠這一層
BFF: 重送檢查，同一個 clientOrderId 直接回那張訂單
資料庫: UNIQUE (customer_id, client_order_id)，ON CONFLICT DO NOTHING 是最後一道防線
```
庫存不夠回 `FAILED_PRECONDITION`，用錯誤細節 `OutOfStockDetail` 帶出商品；呼叫端（BFF）用 `findDetails` 取出。專題刻意的簡化：記憶體裡的庫存與冪等紀錄、沒有補償、沒有斷路器、沒有 Broker；決定與代價寫進 ADR。
