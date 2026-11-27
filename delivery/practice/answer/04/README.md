# cafe：咖啡店點餐系統

顧客在網頁上看菜單、加入購物車、送出訂單；店員在後台看訂單。

## 架構

- `web/`：Vue 3 前台（Vite）
- `api/`：NestJS API（Prisma＋PostgreSQL）
- `shared/`：前後端共用的 API 契約（zod schema）。API 和前台都從這裡 import，改欄位從這裡開始
- `compose.yaml`：開發用的 PostgreSQL

## 快速開始

第一次執行前，把 `api/.env.example` 複製成 `api/.env`（課程的 `node check.mjs` 已經幫你做好）。

```bash
docker compose up -d --wait   # 啟動 PostgreSQL（127.0.0.1:5436）
npm run db:setup              # 建表（prisma migrate deploy）＋種子資料（菜單、顧客）
npm run dev                   # 同時啟動 API 與前台
```

- API：http://localhost:3100 （健康檢查 GET /health 回 `{"status":"ok"}`）
- 前台：http://localhost:5174 （`/api` 開頭的請求由 Vite 轉給 API）

## 設定

API 讀 `api/.env`：`PORT`（預設 3100）、`DATABASE_URL`（PostgreSQL 連線字串）。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /products | 菜單 |
| POST | /orders | 下單，body 與回應的格式見 `shared/contract.ts`（`OrderRequest`、`OrderResponse`）。舊欄位 `note` 在相容期仍接受，回應帶 `Deprecation` 標頭（CAFE-18）。pickupAt 是帶位移的 ISO 8601（例如 `2026-11-03T08:30:00+08:00`），省略＝現點現做；不是今天可選的時段回 422，額滿回 409 `{ code: 'SLOT_FULL' }` |
| GET | /pickup-slots | 今天還能選的取餐時段 `[{ start, label, remaining }]`，label 是台北時間 HH:mm |
| GET | /orders/:id | 查詢訂單 |

錯誤回應一律是 `{ code, message }`（`ApiErrorBody`）：格式不對 422 `VALIDATION_FAILED`、顧客或商品不存在 404。下架商品的行為見 `docs/KNOWN_ISSUES.md`。
