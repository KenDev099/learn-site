# cafe：咖啡店點餐系統

顧客在網頁上看菜單、加入購物車、送出訂單；店員在後台看訂單。

## 架構

- `web/`：Vue 3 前台（Vite）
- `api/`：NestJS API（Prisma＋PostgreSQL）
- `compose.yaml`：開發用的 PostgreSQL

## 快速開始

第一次執行前，把 `api/.env.example` 複製成 `api/.env`（課程的 `node check.mjs` 已經幫你做好）。

```bash
docker compose up -d --wait   # 啟動 PostgreSQL（127.0.0.1:5436）
npm run db:setup              # 建表（prisma migrate deploy）＋種子資料（菜單、顧客）
npm run dev                   # 同時啟動 API 與前台
```

- 前台：http://localhost:5174 （`/api` 開頭的請求由 Vite 轉給 API）

## 設定

API 讀 `api/.env`：`PORT`、`DATABASE_URL`（PostgreSQL 連線字串）。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /products | 菜單 |
| POST | /orders | 下單，body：`{ customerId, items: [{ productId, quantity }], note? }` |
| GET | /orders/:id | 查詢訂單 |

商品不存在時，POST /orders 回 404。下架商品與數量 0 的行為見 `docs/KNOWN_ISSUES.md`。
