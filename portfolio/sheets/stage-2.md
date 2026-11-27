---
title: 作品專案階段 B1：多租戶 SaaS 的平台地基
subtitle: 第 6～10 課一頁圖解：範圍與 ADR、帳號與 token、Prisma extension、RLS、成員與 RBAC
cols: 3
theme: shadcn
課程: 作品專案第 6～10 課
---
租戶只從驗過簽章的 token 來；每個查詢由 Prisma extension 自動加條件，PostgreSQL RLS 再擋一次；角色每個請求從 membership 查。[回作品專案學習地圖](../index.html)

## A 作品的範圍
| | 平台功能 | 業務模組 |
|---|---|---|
| 做到什麼程度 | ok 照契約做完整 | ok 一條有真規則的深流程 |
| 例子 | 隔離、token、成員、稽核、檔案、匯出、方案 | 工單狀態機、時段不重疊、庫存不為負 |
| 不要 | no 先做業務、平台之後補 | no 十個沒有測試的 CRUD |

業務依賴平台，平台不依賴業務；模組地圖寫在 `docs/architecture.md`。

## B ADR 四段
```tree list
docs/adr/0001-tenant-isolation.md
  狀態 | 已採用、已被 N 取代；加日期
  背景 | 租戶數量、資料量、考慮過的選項
  決定 | 共用資料表＋tenant_id，租戶只從 token 來
  後果 | 代價：漏條件就洩漏 → 兩道防線＋跨租戶測試
```
決定改變時寫新的 ADR 取代，舊的只改狀態。錯誤格式從第一天就是 `{ statusCode, errorCode, message, requestId }`，Nest 內建的例外也要轉。

## C 帳號與 token 的資料表
```er LR
User
  id PK
  email string
  password_hash string
Tenant
  id PK
  name string
  plan string
Membership
  tenant_id FK -> Tenant
  user_id FK -> User
  role string
RefreshToken
  id PK
  user_id FK -> User
  family_id uuid
  token_hash string
```
Membership 的主鍵是 (tenant_id, user_id)：角色放這裡，一個人可以屬於多個租戶。註冊＝一個交易建立 user、tenant、owner membership。

## D 一個帶租戶的請求 {span=2}
```sequence
前端 -> 中介軟體: GET /api/v1/projects（Bearer token）
中介軟體 -> Guard: ALS 開一個 { requestId }
Guard -> Guard: 驗 JWT（演算法寫死），sub、tid 放進 ALS
Guard -> DB: 查 membership，角色以資料庫為準
Guard -> Service: 權限符合（沒宣告就 403）
Service -> TenantDb: project.findMany()
TenantDb -> DB: BEGIN；set_config(app.tenant_id, tid, true)；SELECT … WHERE tenant_id = tid；COMMIT
DB --> 前端: 只有這個租戶的列
```

## E 兩道防線各擋什麼
| | Prisma extension | PostgreSQL RLS |
|---|---|---|
| 在哪 | 應用程式：讀改刪加 where.tenantId，建立時覆寫 | 資料庫：policy 用 NULLIF(current_setting('app.tenant_id', true), '')::uuid |
| 擋得住 | ok 業務程式忘了寫條件、findUnique、update、delete | ok $queryRaw、底層 client、忘了加進擴充的新 model |
| 擋不住 | no $queryRaw、include 與巢狀寫入、底層 client | no 用 superuser、BYPASSRLS 或沒有 FORCE 的擁有者連線 |

```callout warn 兩個角色
擁有者只跑 migration（DATABASE_URL）；應用程式用 NOSUPERUSER NOBYPASSRLS、不擁有表的角色（APP_DATABASE_URL）。表一律 ENABLE＋FORCE，WITH CHECK 跟 USING 一樣嚴格。
```

## F set_config 的寫法
| 寫法 | 結果 |
|---|---|
| batch 交易 [set_config(…, true), 查詢] | ok 同一條連線、同一個交易，結束就失效 |
| 互動式交易用外層擴充過的 client | no 每個操作另開交易，回滾不了；改用 tx() |
| 先 set_config(…, false) 再查詢 | no 兩句可能不同連線，設定留給下一個請求 |
| 沒有交易，set_config(…, true) 再查詢 | no 設定在第一句結束就消失，永遠 0 列 |

還沒有租戶的路徑（註冊、登入、refresh、接受邀請）明確設定剛好夠用的上下文，不關掉 RLS。

## G refresh 與邀請 token
| 條件 | refresh token | 邀請 token |
|---|---|---|
| 存什麼 | SHA-256 | SHA-256 |
| 開頭 | userId（給 RLS 找範圍） | tenantId（給 RLS 找範圍） |
| 用一次 | 輪替；用過的再來 → 401 REFRESH_REUSED，撤銷家族 | 條件式更新 acceptedAt；再用 → 410 INVITATION_USED |
| 期限 | 14 天 | 72 小時，過期 410 |
| 撤銷 | logout 撤銷家族 | DELETE 後 410 INVITATION_REVOKED |

邀請信連結一律用設定裡的 APP_URL，不用請求標頭裡的 Host。登入失敗一律 401 INVALID_CREDENTIALS，以 email 限流回 429＋Retry-After。

## H 租戶內 RBAC
```flow LR
[權限矩陣常數] -> [@Permissions 宣告]: 程式只問權限
[@Permissions 宣告] -> [Guard 查 membership]: 每個請求
[Guard 查 membership] -> [Service 的資料規則]: 這一筆是不是你的
```
| 規則 | 錯誤 |
|---|---|
| 不能邀請、指派、管理比自己高的角色 | 403 FORBIDDEN |
| 最後一位 owner 不能降級或移除（先 FOR UPDATE 再數） | 409 LAST_OWNER |
| 被移除的成員，下一個請求 | 401；switch-tenant 403 |
| 別的租戶的資料 | 404 NOT_FOUND |
