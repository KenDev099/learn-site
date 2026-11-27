# ADR 0001：咖啡店的 API 風格

## 狀態

已採用（2026-11-01）。取代「全部都用 REST」的舊做法。

## 背景

咖啡店有四種客戶端：手機 App、官網、店內 POS、外部合作夥伴（外送平台）。後端有訂單（含菜單、會員資料，放在 PostgreSQL）與庫存兩個服務。App 的畫面常常一次要商品、庫存、訂單歷史，行動網路下多一次往返就多幾百毫秒；整條下單路徑的時間預算是 500 ms。團隊四個人，前端熟 Vue，後端用 Node。庫存服務只給內部呼叫，需要明確的 deadline 與狀態碼；合作夥伴只會串標準的 HTTP API。

## 決定

- App 與官網用 GraphQL（Yoga），GraphQL 伺服器同時是 App 的 BFF：一次請求拿齊畫面要的欄位；正式環境只接受 persisted operations，並有深度 6、成本 1000 的限制與欄位層級授權。
- 庫存服務用 gRPC（Connect，proto 用 buf 管理）：BFF 呼叫時帶剩餘預算當 deadline，Reserve 用 idempotency key 讓重試安全。
- 外部合作夥伴用 REST，訂單狀態改變時用 webhook 通知：對方不需要學 GraphQL 或 gRPC，HTTP 快取與版本規則大家都懂。
- 每次合併前跑契約檢查：GraphQL schema 與已上線版本比對、buf breaking、Pact consumer 與 provider 驗證。

## 替代方案

- 全部用 REST：最簡單、CDN 好快取，但 App 的訂單歷史要打好幾支端點，或為每個畫面做專用端點，後端跟著前端改版。
- 全部用 GraphQL（包括服務之間）：服務之間不需要客戶端選欄位，反而少了 proto 的強型別與 deadline、串流的支援。
- App 直接呼叫 gRPC（gRPC-Web 或 Connect）：要把內部服務開放給瀏覽器，App 還是得自己湊多個服務的資料。

## 後果

- 好處：App 一次請求拿齊資料；服務之間有明確的契約與 deadline；破壞性變更在合併前就被擋下。
- 代價：要同時維運 GraphQL、gRPC、REST 三套工具與知識，新成員的學習曲線比較陡。GraphQL 的 HTTP 快取比 REST 複雜，要靠 persisted operations 加 GET 才能用 CDN。BFF 多一跳，庫存服務掛掉時要有降級（菜單照常、庫存顯示 null）。
- 風險：BFF 慢慢長出商業邏輯。規則：商業規則只放在下游服務，BFF 只做聚合與轉換。
- 演進：欄位要移除時先加 @deprecated，從 log 確認沒有客戶端在用再移除；proto 刪欄位用 reserved；契約檢查的 baseline 由發布流程更新，不在 CI 裡重產。
