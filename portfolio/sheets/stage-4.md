---
title: 作品專案 階段 B3：上線與作品
subtitle: 第 15～19 課一頁圖解：OpenAPI、可觀測性、CI/CD、資安檢查、包裝作品
cols: 3
theme: shadcn
課程: 作品專案第 15～19 課
---
作品要讓別人用得起來、查得到問題、可以放心公開。契約從程式產生，一個 requestId 查到底。每次改動都經過真的資料庫與 RLS 驗證，再用探針攻擊自己。最後讓面試官 10 分鐘看懂你的判斷。[回作品專案學習地圖](../index.html)

## A OpenAPI：錯誤也是契約
| 規則 | 做法 |
|---|---|
| DTO 即文件 | ok CLI 外掛：只處理 `.dto.ts`、只在 `nest build` 時有效 |
| 錯誤回應 | ok 一個 `ErrorResponse`、一個 `@ApiErrors()`；要登入的列 401、有 `:id` 的列 404 |
| security 名稱 | warn `addCookieAuth` 的第三個參數要等於 `@ApiCookieAuth` 引用的名字 |
| 文件快照放 Vitest | no Vitest 沒有外掛，DTO 全是空的 |
| 內部網址、像真的 secret | no 文件會公開，example 用明顯的假值 |

`docs/openapi.json` commit 進 repo，CI 對 build 之後的 API 產生一份比對，改到契約的 PR 一定看得見。

## B 一個 requestId 走過的地方 {span=2}
```flow LR
[請求 x-request-id] -> [RequestIdMiddleware]: 1～64 個英數 - _ 就沿用
[RequestIdMiddleware] -> [回應標頭]
[RequestIdMiddleware] -> [錯誤 body 的 requestId]
[RequestIdMiddleware] -> [每一行 JSON log]
[RequestIdMiddleware] -> [job 資料 → worker ctx.run]
[RequestIdMiddleware] -> [稽核紀錄]
```
requestId 與 helmet 都要放在 body parser 之前。JSON 格式壞掉時，請求在 body parser 就失敗，跑不到模組裡的 middleware。`AppLogger` 每行自動帶 requestId、tenantId、userId；log 只記 id 與事件，不記密碼、token、body。

## C 錯誤與健康檢查
| 情況 | 回應 | log |
|---|---|---|
| 預期內（4xx、`ApiError`） | 狀態碼＋`errorCode`＋自己寫的 message | 不記 |
| 未預期（bug、資料庫錯誤） | 500 `INTERNAL_ERROR`，不帶 stack | filter 記一次 |
| 非 production 回傳 stack | no staging、demo 常常不是 production | — |

`/health/live` 不查依賴；`/health/ready` 查資料庫與 Redis，失敗只暫停送流量。這課的示範：名稱含 NUL 字元會讓 PostgreSQL 丟 22021，是不用後門的 500。

## D CI 與部署的順序 {span=2}
```flow LR
[npm ci] -> [lint 與型別] -> [migrate deploy] -> [npm test：API 用 pf_app] -> [build 映像：commit SHA]
[build 映像：commit SHA] -> [migrate 服務：擁有者] -> [api：pf_app] -> [冒煙測試]
```
CI 用 `POSTGRES_USER` 建出來的帳號是 superuser，一律繞過 RLS，所以測試時 API 要用 `pf_app` 連線。Docker build 的兩個坑：`prisma.config.ts` 用 `process.env.DATABASE_URL`（`env()` 沒有變數就失敗）；migrate 服務用 `target: build`（正式映像沒有 prisma CLI）。測試步驟不能 `continue-on-error`；標籤不用 `latest`；回滾就是部署上一個 SHA。

## E 刪欄位要拆成幾次部署
```timeline h
第 1 次 | expand | 新增新欄位並複製；程式兩個都寫、讀新的
第 2 次 | 換程式 | 程式只用新欄位
第 3 次 | contract | 刪掉舊欄位
```
migration 先跑、程式後換，中間舊程式還在跑：一次就刪欄位，舊副本全部 500。API 回應的欄位也一樣，前端是另一個舊版程式。

## F 用探針攻擊自己 {span=2}
```sequence
A 的 member -> API: POST create → id
B 的 owner -> API: GET／PATCH／DELETE item
API --> B 的 owner: 404（不是 403）
A 的 viewer -> API: PATCH／DELETE item
API --> A 的 viewer: 403
沒登入 -> API: GET item
API --> 沒登入: 401
note API: 另開的 client 或擁有者連線會同時繞過 extension 與 RLS，探針只看結果
```
自己 repo 的跨租戶 E2E 用 `ENDPOINTS` 表，每個 `:id` 端點一列。mass assignment：DTO 白名單擋多餘欄位，授權相關的值（role、tenantId、plan）只來自伺服器的資料。SAST、DAST 都抓不到 BOLA。

## G 設定的防線與 OWASP 對照
| 項目 | 作品 |
|---|---|
| API1 BOLA | ok extension＋RLS＋跨租戶 E2E |
| API3 屬性授權 | ok DTO 白名單；接受邀請的角色來自邀請 |
| API4 資源上限 | ok JSON 1 MB、檔案 5 MB、每租戶限流、方案上限 |
| API8 設定錯誤 | ok helmet、CORS 白名單（不用 `origin: true`）、錯誤 message 自己寫 |
| API9 資產管理 | ok OpenAPI 從程式產生 |

找到的問題：開 issue → 先寫失敗的測試 → 修補 commit 連到 issue。排序看影響 × 可能性。

## H 包裝作品：README 與面試 {span=3}
| 給面試官的 | 內容 |
|---|---|
| README 順序 | 一句話 → demo 與示範帳號 → 架構圖 → 功能（平台／業務）→ 設計決定 → 如何執行 → 測試 → 已知限制 |
| 兩張 Mermaid 圖 | 元件圖（有哪些東西）、時序圖（帶租戶的請求從 guard 到 RLS） |
| ADR | 隔離、RLS、token、檔案、背景工作、方案與限流；編號連續，被推翻就寫新的、舊的改狀態 |
| 公開前 | 掃 `git log -p --all`；外洩的 secret 先撤銷再改寫歷史；示範資料用 `@example.test` |
| demo 3 分鐘 | 邀請 → 建立、上傳、匯出 → 換租戶貼 id 得到 404 → 稽核 → viewer 403 與方案上限；同時是回歸測試 |
```callout ok 面試時的講法
挑兩個取捨講深（兩道隔離防線、用量上限的競態），不要列十個功能。被問替代方案：先講你的選擇在什麼條件下成立、代價怎麼補，再講什麼條件會讓決定改變。被問還差什麼：金流、S3、備份還原演練、監控告警、拆出 worker，並說出先做哪一個。
```
