# 小專案契約：活動報名 API（第 1～5 課）

驗收測試只照這份契約打 HTTP：只比對**路徑、方法、狀態碼、`errorCode`、列出的欄位**；`message` 的文字、沒列出的欄位、程式怎麼寫都不檢查。
參考實作：`nestjs/practice/portfolio-ref/small/`。

## 共通規則

- 路徑前綴 `/api/v1`；健康檢查 `/health/live`、`/health/ready` 不加前綴。
- ID 一律是字串（參考實作用 UUID；測試不假設格式）。時間是 ISO 8601 字串。
- 錯誤回應一律：

  ```json
  { "statusCode": 404, "errorCode": "EVENT_NOT_FOUND", "message": "找不到這個活動", "requestId": "…" }
  ```

  `errorCode` 是 SCREAMING_SNAKE；`requestId` 跟回應標頭 `x-request-id` 相同。
- 列表一律 `{ "items": [...], "nextCursor": "…" | null }`（游標分頁）。`limit` 選填，1～100，預設 20。
- 多餘的欄位一律 400 `VALIDATION_FAILED`。

## 端點

| 端點 | 成功 | 錯誤 |
|---|---|---|
| `POST /api/v1/events` `{ title, startsAt, capacity }` | 201 `{ id, title, startsAt, capacity, remaining }`，`remaining` 等於 `capacity` | 400 `VALIDATION_FAILED`：title 1～100 字、startsAt 是未來的 ISO 時間、capacity 是 1～500 的整數、多餘欄位 |
| `GET /api/v1/events?cursor=&limit=` | 200 `{ items, nextCursor }`，依 `startsAt`（相同時依 `id`）由早到晚 | 400 `VALIDATION_FAILED`：cursor 壞掉 |
| `GET /api/v1/events/:id` | 200（同建立的回應） | 404 `EVENT_NOT_FOUND` |
| `POST /api/v1/events/:id/registrations` `{ email, name }` | 201 `{ id, eventId, email, name, createdAt }`，`email` 存小寫 | 400 `VALIDATION_FAILED`；404 `EVENT_NOT_FOUND`；409 `EVENT_FULL`；409 `ALREADY_REGISTERED`（email 不分大小寫） |
| `DELETE /api/v1/events/:id/registrations/:regId` | 204，`remaining` 加回 1 | 404 `REGISTRATION_NOT_FOUND` |
| `GET /health/live` | 200 | — |
| `GET /health/ready` | 200，body 是 @nestjs/terminus 的格式，`details.database.status` 是 `"up"` | 503 |

## 規則

- 名額不能超賣：名額 N 的活動同時收到很多報名，恰好 N 個 201，其餘 409 `EVENT_FULL`，最後 `remaining` 是 0。
- 重複報名（409 `ALREADY_REGISTERED`）不會扣名額。
- 不存在的 id、格式不對的 id 都回 404（不是 400 或 500）。

## repo（第 1、4、5 課的灰箱檢查）

| 課 | 檢查 |
|---|---|
| 1 | `prisma/migrations/*/migration.sql` 有 `(event, email)` 的 UNIQUE 與跟 capacity 有關的 CHECK；`.env.example` 存在、`.gitignore` 有 `.env`、`.env` 沒被 git 追蹤；`compose.yaml` 有 `postgres:` 映像的服務，port 只綁 `127.0.0.1` |
| 4、5 | 由第 4、5 課補上 |

## `work/portfolio.json`

```json
{ "small": { "api": "http://localhost:3000", "repo": "/絕對路徑/event-signup" } }
```

第 4 課加 `composeApi`（用 compose 啟動的 API），第 5 課加 `deployUrl`（選做）。環境變數 `PF_SMALL_API`、`PF_SMALL_REPO`、`PF_SMALL_COMPOSE_API`、`PF_SMALL_DEPLOY_URL` 優先。
