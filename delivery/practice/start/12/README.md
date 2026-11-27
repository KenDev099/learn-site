# cafe：咖啡店點餐系統

顧客在網頁上看菜單、加入購物車、送出訂單；店員在後台看訂單。

## 架構

- `web/`：Vue 3 前台（Vite）
- `api/`：NestJS API（Prisma＋PostgreSQL）
- `shared/`：前後端共用的 API 契約（zod schema）。API 和前台都從這裡 import，改欄位從這裡開始
- `compose.yaml`：開發用的 PostgreSQL
- `cafepay/server.mjs`：本機的假金流商 CafePay（開發與測試用；正式環境連真的 CafePay）
- `vendor/`：CafePay 的 SDK（1.4.2 與 2.0.0），由 `package.json` 的 `imports`（`#cafepay-sdk-v1`、`#cafepay-sdk-v2`）載入

## 快速開始

第一次執行前，把 `api/.env.example` 複製成 `api/.env`（課程的 `node check.mjs` 已經幫你做好）。

```bash
docker compose up -d --wait   # 啟動 PostgreSQL（127.0.0.1:5436）
npm run db:setup              # 建表（prisma migrate deploy）＋種子資料（菜單、顧客）
npm run dev                   # 同時啟動 API 與前台
npm test                      # 跑 api/src 底下的 *.spec.ts（用 api/.env 的資料庫）
npm run ci                    # 跑一次跟 CI 一樣的檢查（deps、typecheck、test），結果在 ci-report.json
npm run reconcile             # 補單：向 CafePay 查詢等太久的付款，套用結果（正式環境由排程執行）
npm run repair-points -- --dry-run   # CAFE-33 資料修復：試跑（見 scripts/）；--apply --run-id <名稱> 正式執行
npm run undo-repair -- --run-id <名稱>   # 撤回某一次資料修復
npm run flag -- payments.sdk_v2 10   # 功能旗標：CafePay SDK 2.0 開給 10% 的新付款（0＝退回），不用重新部署
npm run flag -- orders.search off    # 開關型的旗標用 on／off；每次修改記在 ops/flag-changes.log
npm run daily-check                  # 每日對帳：昨天的付款逐筆向 CafePay 查詢，列出對不起來的
```

- API：http://localhost:3100 （健康檢查 GET /health 回 `{"status":"ok"}`）
- 前台：http://localhost:5174 （`/api` 開頭的請求由 Vite 轉給 API）
- 假 CafePay：http://localhost:3190 （`npm run dev` 一起啟動；故障開關見 `cafepay/server.mjs` 開頭的說明）

## 設定

API 讀 `api/.env`：`PORT`（預設 3100）、`DATABASE_URL`（PostgreSQL 連線字串）、`CAFEPAY_URL`、`CAFEPAY_TIMEOUT_MS`（呼叫 CafePay 最多等幾毫秒）、`CAFEPAY_WEBHOOK_SECRET`（驗證 webhook 簽章的密鑰）、`SESSION_SECRET`（登入 cookie 的簽章密鑰，沒設定 API 不會啟動）。

示範帳號（種子資料）：顧客 `customer1`～`customer6`，密碼 `latte-1`～`latte-6`；店員 `counter`，密碼 `barista-7`。

log 是 JSON 格式（一行一個物件）。每個請求一行 `context: "HTTP"`，`message` 裡有 `requestId`、`status`、`durationMs`；下單另外記 `customerId` 與 `productIds`。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /products | 菜單 |
| POST | /orders | 下單，body 與回應的格式見 `shared/contract.ts`（`OrderRequest`、`OrderResponse`）。舊欄位 `note` 在相容期仍接受，回應帶 `Deprecation` 標頭（CAFE-18）。pickupAt 是帶位移的 ISO 8601（例如 `2026-11-03T08:30:00+08:00`），省略＝現點現做；不是今天可選的時段回 422，額滿回 409 `{ code: 'SLOT_FULL' }` |
| GET | /pickup-slots | 今天還能選的取餐時段 `[{ start, label, remaining }]`，label 是台北時間 HH:mm |
| POST | /auth/login | 登入，body `{ username, password }`。成功回 200 並設定 HttpOnly 的 `sid` cookie；帳號或密碼不對 401 |
| GET | /orders/search?q= | 店員訂單搜尋（CAFE-41）：備註包含 q 的最新 20 張。要用店員帳號登入；旗標 `orders.search` 關閉時回 404 |
| GET | /orders/:id | 查詢訂單。要登入：顧客只看得到自己的訂單（別人的回 404），店員看得到全部（SEC-7） |
| GET | /orders/:id/ticket | 櫃台小票（純文字），取餐時間是台北時間。登入規則同上 |
| POST | /orders/:id/pay | 付款，body `{ cardToken }`。200 `{ status: 'paid' }`；202 `{ status: 'unknown' }`＝結果還不知道（畫面顯示「付款確認中」）；卡片被拒絕 402 `CARD_DECLINED` |
| POST | /webhooks/cafepay | CafePay 的付款通知，要有 `CafePay-Signature` 簽章（不對回 401） |

錯誤回應一律是 `{ code, message }`（`ApiErrorBody`）：格式不對 422 `VALIDATION_FAILED`、顧客或商品不存在 404。下架商品的行為見 `docs/KNOWN_ISSUES.md`。
