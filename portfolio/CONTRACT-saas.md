# SaaS 契約（第 6～19 課）

第 6 課公布，之後各課只會**加**端點。驗收測試只比對**路徑、方法、狀態碼、`errorCode`、列出的欄位**；`message`、沒列出的欄位、實作方式都不檢查。業務模組（你自選的題目）不在契約裡，用第 18 課的 BOLA 探針驗。
參考實作：`nestjs/practice/portfolio-ref/saas/`（煙霧測試 `smoke/contract.smoke.ts` 涵蓋這份契約的每一條）。

## 共通規則

- 路徑前綴 `/api/v1`；健康檢查 `/health/live`、`/health/ready`；OpenAPI `/openapi.json`、`/docs` 不加前綴。
- 錯誤回應一律 `{ statusCode, errorCode, message, requestId }`。沒有特別列出 errorCode 時，依狀態碼：

  | 狀態碼 | errorCode |
  |---|---|
  | 400 | `VALIDATION_FAILED`（含多餘欄位、壞掉的 JSON、壞掉的 cursor） |
  | 401 | `UNAUTHENTICATED` |
  | 403 | `FORBIDDEN` |
  | 404 | `NOT_FOUND`（不存在、id 格式不對、**屬於別的租戶**一律這個） |
  | 413 | `PAYLOAD_TOO_LARGE` |
  | 429 | `RATE_LIMITED`（有 `Retry-After` 標頭） |
  | 500 | `INTERNAL_ERROR`（不帶 stack 與資料庫訊息） |
- ID 一律字串；時間 ISO 8601。列表一律 `{ items, nextCursor }`。
- 租戶由 access token 決定。請求送來的 `tenantId`（body、query、header）一律不採用：body 多出的欄位回 400，或被忽略（兩種都可以），但資料一定在 token 的租戶。
- 每個回應都有 `x-request-id`：請求帶的值是 1～64 個英數、`-`、`_` 就沿用，否則換一個新的。

## 角色與權限矩陣

`owner` ＞ `admin` ＞ `member` ＞ `viewer`。

| 動作 | viewer | member | admin | owner |
|---|---|---|---|---|
| 讀 projects、tags、files、exports、members、billing | ✓ | ✓ | ✓ | ✓ |
| 建立／修改 project、tag；上傳／刪除檔案；建立匯出 | 403 | ✓ | ✓ | ✓ |
| 刪除 project、tag | 403 | 403 | ✓ | ✓ |
| 成員管理、邀請（列出、建立、撤銷）、讀稽核 | 403 | 403 | ✓ | ✓ |
| 改方案 | 403 | 403 | 403 | ✓ |

不能邀請或指派比自己高的角色、不能管理比自己高的人（403 `FORBIDDEN`）；最後一位 owner 不能被降級或移除（409 `LAST_OWNER`）。

## 端點

| 課 | 端點 | 成功 | 錯誤 |
|---|---|---|---|
| 6 | `GET /health/live` | 200 | — |
| 6 | `GET /health/ready` | 200，terminus 格式，`details.database.status`（第 16 課起還有 `details.redis.status`）是 `"up"` | 503 |
| 7 | `POST /auth/signup` `{ email, password（8～128）, name, tenantName }` | 201 `{ user: { id, email, name }, tenant: { id, name }, role: "owner" }` | 400；409 `EMAIL_TAKEN`（不分大小寫） |
| 7 | `POST /auth/login` `{ email, password }` | 200 `{ accessToken }`＋refresh token cookie（`HttpOnly`、`SameSite`、`Path=/api/v1/auth`；本機可以不加 `Secure`） | 401 `INVALID_CREDENTIALS`（帳號不存在與密碼錯一樣）；同一個 email 連續失敗會 429 `RATE_LIMITED`（門檻自訂，測試打 20 次） |
| 7 | `POST /auth/refresh`（帶 cookie） | 200 `{ accessToken }`＋新的 cookie（輪替） | 401；用過的 token 再用 401 `REFRESH_REUSED`，之後同一家族的 token 都 401 |
| 7 | `POST /auth/logout`（帶 cookie） | 204，之後這個 refresh token 401 | — |
| 7 | `GET /me` | 200 `{ user: { id, email, name }, tenant: { id, name, plan }, role }` | 401（沒有 token、壞 token、`alg: none`、別的金鑰簽的） |
| 8 | `POST /projects` `{ name（1～100）, description? }` | 201 `{ id, name, description, archived, createdAt, updatedAt }` | 400；403 `PLAN_LIMIT_REACHED`（第 14 課） |
| 8 | `GET /projects?cursor=&limit=` | 200 `{ items, nextCursor }`，依建立時間由舊到新 | 400 |
| 8 | `GET`／`PATCH`（`{ name?, description?, archived? }`）／`DELETE /projects/:id` | 200／200／204 | 404 `NOT_FOUND` |
| 10 | `GET /members` | 200 `{ items: [{ userId, email, name, role, joinedAt }] }` | — |
| 10 | `PATCH /members/:userId` `{ role }` | 200 `{ userId, role }` | 403；404；409 `LAST_OWNER` |
| 10 | `DELETE /members/:userId` | 204；被移除的人手上的 access token 之後 401 或 403 | 403；404；409 `LAST_OWNER` |
| 10 | `POST /invitations` `{ email, role }` | 201 `{ id, email, role, createdAt, expiresAt }`；寄一封信，信裡的連結帶 `?token=…`，網址開頭是設定的前端網址（不是請求的 Host） | 403（角色比自己高）；409 `ALREADY_MEMBER`；403 `PLAN_LIMIT_REACHED`（第 14 課） |
| 10 | `GET /invitations` | 200 `{ items }`（還有效的邀請） | — |
| 10 | `DELETE /invitations/:id` | 204 | 404 |
| 10 | `POST /auth/invitations/accept` `{ token, name?, password? }`（還沒有帳號時 name、password 必填） | 200 `{ tenant: { id, name }, role }` | 400；404 `INVITATION_NOT_FOUND`；410 `INVITATION_USED`、`INVITATION_REVOKED`、`INVITATION_EXPIRED` |
| 10 | `GET /auth/tenants` | 200 `{ items: [{ id, name, role }] }` | 401 |
| 10 | `POST /auth/switch-tenant` `{ tenantId }` | 200 `{ accessToken }`＋新的 cookie | 403 `FORBIDDEN`（不是成員） |
| 11 | `GET /audit-logs?action=&cursor=` | 200 `{ items: [{ id, actorId, action, targetType, targetId, requestId, createdAt }], nextCursor }`，新的在前 | 403 |
| 12 | `POST /projects/:id/files`（multipart，欄位 `file`） | 201 `{ id, projectId, filename, contentType, size, createdAt }` | 404；413 `FILE_TOO_LARGE`（5 MB）；415 `UNSUPPORTED_FILE_TYPE`（看內容，接受 PNG、JPEG、GIF、PDF）；403 `PLAN_LIMIT_REACHED` |
| 12 | `GET /files/:id` | 200（metadata） | 404 |
| 12 | `GET /files/:id/content` | 200 檔案內容（或 302 到儲存的網址）；`Content-Disposition: attachment`（中文檔名用 `filename*=UTF-8''…`）、`X-Content-Type-Options: nosniff` | 404 |
| 12 | `DELETE /files/:id` | 204 | 404 |
| 13 | `POST /exports` `{ type: "projects" }` | 202 `{ id, status: "queued" }` | 400；403 |
| 13 | `GET /exports/:id` | 200 `{ id, type, status, rowCount, createdAt, finishedAt }`；status 是 `queued`、`running`、`done`、`failed` | 404 |
| 13 | `GET /exports/:id/content` | 200 CSV（標題列 `id,name,description,archived,createdAt`；有逗號、雙引號、換行的值用雙引號包；`= + - @` 開頭的值前面加 `'`） | 404；409 `EXPORT_NOT_READY` |
| 14 | `GET /billing` | 200 `{ plan, limits: { projects, members, storageBytes }, usage: { projects, members, storageBytes } }` | — |
| 14 | `POST /billing/plan` `{ plan: "free" \| "pro" }` | 200（同 `GET /billing`） | 400；403 |
| 15 | `GET /openapi.json` | OpenAPI 3.x，包含這份契約的每個路徑與方法；受保護的端點有 security；錯誤回應引用同一個 schema（含 `errorCode`） | — |
| 15 | `GET /docs` | Swagger UI | — |
| 18 | `PATCH /me` `{ name }` | 200（同 `GET /me`）；`role`、`tenantId`、`plan` 這類欄位不生效 | 400 |

## 方案（契約的一部分）

| | free | pro |
|---|---|---|
| project | 3 | 100 |
| 成員（含還有效的邀請） | 5 | 50 |
| 檔案總容量 | 20 MB | 1 GB |

每個租戶每分鐘 300 個請求（登入後的請求都算），第 301 個 429 `RATE_LIMITED`＋`Retry-After`；別的租戶不受影響。超過方案上限一律 403 `PLAN_LIMIT_REACHED`。

## 稽核 action

`project.created`、`project.updated`、`project.deleted`、`member.role_changed`、`member.removed`、`invitation.created`、`invitation.revoked`、`invitation.accepted`、`file.uploaded`、`file.deleted`、`export.requested`、`billing.plan_changed`（你的業務模組自己加，格式 `<資源>.<動作>`）。失敗的操作不寫。`requestId` 等於那次回應的 `x-request-id`。

## 灰箱檢查

- 第 9、11 課用 `appDatabaseUrl`（應用程式執行時的資料庫角色）直連：不是 superuser、沒有 BYPASSRLS、不是表的擁有者；每張有 `tenant_id` 欄位的表 `relrowsecurity`、`relforcerowsecurity` 都是 true；沒設 `app.tenant_id` 時查不到資料；在交易裡 `set_config('app.tenant_id', A, true)` 之後只看到 A、寫入別的租戶被 policy 擋；稽核表沒有 UPDATE、DELETE 權限。設定名稱固定是 `app.tenant_id`。
- 第 6、17、19 課讀 `repo` 的檔案：`docs/adr/NNNN-*.md`（狀態、背景、決定、後果四段）、README、Dockerfile、compose、workflow。

## `work/portfolio.json`

```json
{
  "saas": {
    "api": "http://localhost:3100",
    "repo": "/絕對路徑/my-saas",
    "mailpit": "http://localhost:8026",
    "appDatabaseUrl": "postgresql://app_user:密碼@localhost:5434/my_saas",
    "bolaProbes": [
      { "name": "工單", "create": { "path": "/api/v1/tickets", "body": { "title": "測試" } },
        "item": "/api/v1/tickets/:id", "update": { "body": { "title": "改" } } }
    ]
  }
}
```

測試用的帳號一律 `pf-<執行編號>-<角色>@example.test`，每次執行都不同，可以重複跑；資料會留在你的開發資料庫。
