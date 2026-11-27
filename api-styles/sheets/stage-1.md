---
title: API 風格與整合 階段 1：選擇 API 風格
subtitle: 第 1 課一頁圖解：REST、GraphQL、gRPC、事件的取捨與選法
cols: 3
theme: shadcn
課程: API 風格與整合 第 1 課
---
選風格是選取捨，不是選流行。先問誰呼叫、要不要立刻拿到結果、資料形狀誰決定、要不要快取、團隊熟不熟；一個系統混用多種風格是常態。[回 API 風格與整合 學習地圖](../index.html)

## A REST 的「我的訂單」：拿太多與拿不夠 {span=2}
```sequence
participants: App, REST API
App -> REST API: GET /orders?customer=1
App -> REST API: GET /members/1（和列表同時送）
REST API --> App: 訂單列表，每筆只有 id、total、orderedAt
App -> REST API: 每張訂單各一次 GET /orders/:id/items
REST API --> App: 品項只有 productId
App -> REST API: 每個品項各一次 GET /products/:id
note App, REST API: 請求次數 1 + N + 品項數 + 1；瀑布深度 3
```
- 拿太多（over-fetching）：畫面只要點數，`GET /members/1` 卻回了電話、email、生日。
- 拿不夠（under-fetching）：一支端點湊不齊，後面的請求要等前面的結果，形成瀑布。
- 等待時間大約是「深度 × 單次延遲」；N 個不相依的請求同時送，深度不會變成 N。for 迴圈一個一個 await，深度才會變成 N + 1，這是寫法的問題。

## B 先量測再換
```callout info 打開 Network 面板數一數
節流設成 Slow 4G，看瀑布圖有幾個請求、幾段必須依序。很多時候改成 `Promise.all`，或在 REST 加一支專給這個畫面的端點（例如 `GET /me/order-summary`）就好。好幾個畫面、好幾種前端都重複遇到，才值得考慮 GraphQL。
```
「gRPC 比較快」要先問延遲花在哪裡：多數 API 的時間花在資料庫和網路往返，JSON 換二進位省下的通常不多。換風格的成本主要在契約與工具：程式碼產生、測試、監控、閘道、文件、團隊學習。

## C 四種風格並排比較 {span=3}
| | REST | GraphQL | gRPC | 事件 |
|---|---|---|---|---|
| 契約 | OpenAPI | GraphQL schema | `.proto` | 事件格式（JSON Schema、AsyncAPI 等） |
| 呼叫端等結果嗎 | 等 | 等 | 等（也可以串流） | 不等 |
| 資料形狀誰決定 | 伺服器 | 客戶端，每次查詢自選 | 伺服器，訊息定義固定 | 發送端 |
| 瀏覽器直接呼叫 | ok 可以 | ok 可以 | no 要 gRPC-Web／Connect | 不適用 |
| HTTP／CDN 快取 | ok GET 直接可用 | warn 幾乎不行 | no 不行 | 不適用 |
| 除錯 | curl、瀏覽器 | GraphiQL、curl | grpcurl、buf curl | 追 log 與關聯 ID |
| 典型用途 | 公開 API、外部合作夥伴、可快取的讀取 | 多種前端、畫面變化快 | 講求效能、需要串流或多語言共用契約的內部呼叫 | 跨團隊通知、不用等結果的後續工作 |

gRPC 先寫 `.proto` 再產生兩邊的程式碼；Protobuf 二進位、走 HTTP/2，內建 deadline 與串流。

tRPC：前後端都是 TypeScript、同一個 repo、只服務自己的前端時直接共用型別。它沒有契約檔，換語言或開放給別的團隊時沒有東西可以交出去。

## D 每種風格的代價
```kv cols=1
GraphQL: HTTP 快取幾乎用不上（實務上幾乎都 POST 到 /graphql）；N+1 從前端搬到後端；要限制深度與成本；它不是資料庫查詢語言，資料怎麼查由 resolver 決定
GraphQL 監控: 欄位出錯常常還是 HTTP 200，錯誤在 errors 裡；log 與監控用查詢名稱分組，記下 errors 數量
gRPC: 瀏覽器不能直接呼叫原生 gRPC（依賴 HTTP/2 資料框與 trailers）；二進位不能直接看；CDN 不快取；外部合作夥伴要先拿 .proto 產生程式碼
gRPC 負載平衡: HTTP/2 長連線，只在建立連線時分配的 L4 會讓呼叫一直落在同一台；改用 L7 或 client-side load balancing
事件: 最終一致；除錯要靠關聯 ID 和集中 log；事件會重複、會亂序；不適合要立刻回應的請求
```

## E 決策表：由上往下，第一個符合的列 {span=2}
| # | 條件 | 風格 | 理由代碼 |
|---|---|---|---|
| 1 | 不需要立刻拿到結果（不管誰呼叫） | event | `fire-and-forget` |
| 2 | 呼叫端是外部合作夥伴 | rest | `external-partner` |
| 3 | 呼叫端是內部服務（本課假設：呼叫量大、要低延遲） | grpc | `internal-low-latency` |
| 4 | 前端，需要 CDN／HTTP 快取 | rest | `browser-caller`、`needs-cdn-cache` |
| 5 | 前端，資料形狀由畫面決定 | graphql | `browser-caller`、`client-shaped-data` |
| 6 | 前端，其他 | rest | `browser-caller` |

「不用等結果」放第一：同步呼叫會讓對方掛掉時連帶失敗。快取省下整台伺服器的負載，所以第 4 列比第 5 列優先。這是課程練習用的簡化版，第 3 列是咖啡店的前提，不是通則：內部服務之間用 REST／JSON 也很常見，團隊沒人熟 gRPC 時可以推翻這一列。真實決定還要加上團隊熟悉度，並寫成 ADR：情境、考慮過的選項、選了什麼、放棄了什麼。

## F 咖啡店混用四種風格
```flow LR
[App、網頁] -> [GraphQL BFF]: GraphQL
[外部合作夥伴] -> [公開 REST API]: REST
[GraphQL BFF] -> 訂單服務
[公開 REST API] -> 訂單服務
訂單服務 -> 庫存服務: gRPC
訂單服務 -> [(佇列)]: OrderShipped 事件
[(佇列)] --> 會計 & 點數 & [推播、webhook]
```
```callout warn 改用事件之前
先跟 PM 談畫面怎麼呈現（例如「點數處理中」），問清楚事件堆積時誰收到告警；事件格式也是契約。只有一個接收者、就在同一個服務裡，直接呼叫函式就好。
```
