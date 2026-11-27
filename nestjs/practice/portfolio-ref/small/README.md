# 活動報名 API

讀書會、工作坊這類小活動的報名後端：建立活動、報名、取消；名額不會超賣，同一個 email 不能重複報名。

## 如何執行

```bash
npm ci                                          # 剛 clone 的 repo 沒有 node_modules
cp .env.example .env
npx prisma generate                             # src/generated 不進 git，要自己產生
npm run db:up                                   # 開發用 PostgreSQL（compose.yaml 的 db，127.0.0.1:5434）
npx prisma migrate deploy && npm run start:dev  # http://localhost:3000
```

要用容器跑整套：`docker compose --profile app up -d --build`（API 在 http://localhost:3001）。

## 架構

NestJS 12＋Prisma 7＋PostgreSQL 18。`src/events/` 是唯一的功能模組（controller → service → Prisma）；`src/common/` 放錯誤格式與 requestId；`src/health/` 是 live／ready。名額用條件式 `UPDATE … WHERE remaining > 0` 扣，跟新增報名在同一個交易。

## API

| 端點 | 說明 |
|---|---|
| `POST /api/v1/events` | 建立活動 `{ title, startsAt, capacity }` |
| `GET /api/v1/events?cursor=` | 游標分頁，依 startsAt 排序 |
| `GET /api/v1/events/:id` | 活動與剩餘名額 |
| `POST /api/v1/events/:id/registrations` | 報名 `{ email, name }`；409 `EVENT_FULL`、`ALREADY_REGISTERED` |
| `DELETE /api/v1/events/:id/registrations/:regId` | 取消報名，名額還回去 |
| `GET /health/live`、`/health/ready` | 健康檢查 |

錯誤一律是 `{ statusCode, errorCode, message, requestId }`。

## 測試

`npm test`：單元測試（`src/**/*.spec.ts`）與 E2E（`test/**/*.e2e-spec.ts`，連真的 PostgreSQL，資料庫名稱自動加 `_spec`）。

## 設計決定

- 名額用條件式 UPDATE，不用「先查剩幾個再新增」：後者在併發時會超賣。
- email 存小寫＋唯一約束 `(event_id, email)`：重複報名由資料庫擋，不靠程式先查。
- 游標分頁而不是 offset：翻頁中間有人新增活動，也不會重複或漏掉。
- migration 是獨立的一次性服務，不在 API 啟動時跑。
