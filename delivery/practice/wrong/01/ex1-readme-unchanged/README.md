# cafe：咖啡店點餐系統

顧客在網頁上看菜單、加入購物車、送出訂單；店員在後台看訂單。

## 架構

- `web/`：Vue 3 前台（Vite）
- `api/`：NestJS API（Prisma＋PostgreSQL）
- `compose.yaml`：開發用的 PostgreSQL

## 快速開始

```bash
docker compose up -d --wait
export DB_HOST=localhost
npm run dev
```

API 會開在 http://localhost:3000 ，前台是 http://localhost:5174 。

## 設定

API 讀環境變數 `DB_HOST`、`DB_USER`、`DB_PASSWORD` 連資料庫。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | /products | 菜單 |
| POST | /orders | 下單，body：`{ customerId, items: [{ productId, quantity }], note? }` |
| GET | /orders/:id | 查詢訂單 |

商品下架或不存在時，POST /orders 回 404。
