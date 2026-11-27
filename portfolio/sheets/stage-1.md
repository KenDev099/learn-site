---
title: 作品專案階段 A：小專案走完一次
subtitle: 第 1～5 課一頁圖解：需求到 schema、分層與錯誤格式、測試、Docker、CI 與 README
cols: 3
theme: shadcn
課程: 作品專案第 1～5 課
---
從空資料夾做出一個完整的小專案：規則能交給資料庫的就交給資料庫，判斷與寫入不留空檔，每一步都有自動檢查。[回作品專案學習地圖](../index.html)

## A 規則放在哪一層
| 規則 | 放在哪 | 為什麼 |
|---|---|---|
| 同一場同一 email 只報一次 | ok `UNIQUE (event_id, email)`，email 存小寫 | 同時送來時程式先查兩邊都查到沒有 |
| 名額 1～500、剩餘不為負 | ok `CHECK`（手寫在 migration） | 只看同一列，任何寫入都擋得住 |
| 名額滿了不能報 | warn 程式：交易＋條件式 UPDATE | 跨列計數，CHECK 做不到 |
| 活動時間在未來 | warn 程式：service 跟 now 比 | 放 CHECK 會讓舊資料變不合法 |

Prisma schema 寫不出 CHECK：`migrate dev --create-only` 產生草稿、手寫、再套用。

## B 一個請求怎麼走 {span=2}
```flow LR
[requestId middleware] -> [ValidationPipe]: x-request-id
[ValidationPipe] -> [Controller]: DTO，多餘欄位 400
[Controller] -> [Service]: 不碰 Prisma
[Service] -> [(PostgreSQL)]: 交易
[Service] --> [ErrorFilter]: ApiError 或未預期錯誤
[ErrorFilter] --> [回應]: statusCode、errorCode、message、requestId
```
全域設定集中在 `configureApp()`，`main.ts` 與 E2E 共用。P2002 在 service 翻成 409 `ALREADY_REGISTERED`；沒人接的錯誤一律 500 `INTERNAL_ERROR`，stack 只進 log。

## C 名額不超賣 {span=2}
```sequence
請求 A -> DB: UPDATE events SET remaining = remaining - 1 WHERE id = … AND remaining > 0
請求 B -> DB: 同一句，排在 A 後面
DB --> 請求 A: count 1，接著 INSERT 報名
note 請求 B: A 提交後用最新的 remaining 重新檢查 WHERE
DB --> 請求 B: count 0，回 409 EVENT_FULL
```
```callout warn check-then-insert
先 count 再 create：一次一個請求時是對的，同時到的請求會一起通過判斷。扣名額與新增報名在同一個交易，重複報名撞到唯一約束時名額一起回滾。
```

## D 游標分頁
- 游標是上一頁最後一筆的 `(startsAt, id)`，base64url 編碼，前端不解析。
- where：時間比較晚，或時間相同但 id 比較大；排序同樣加 id。
- `take: limit + 1` 多拿一筆，才知道有沒有下一頁。
- offset 在翻頁途中有人新增資料時會重複；壞掉的游標回 400，不是 500。

## E 測試放在規則被執行的地方
| 測什麼 | 用什麼 | 理由 |
|---|---|---|
| 游標編碼、解碼 | ok 單元測試 `src/**/*.spec.ts` | 純函式，邊界一次列很多 |
| 名額、重複、錯誤格式 | ok E2E 連真的 PostgreSQL | 規則靠約束與交易擋 |
| mock Prisma | no 看不到 P2002、條件式 UPDATE、回滾 | 測到的是想像 |

資料庫名稱自動加 `_spec`；globalSetup 建庫並 `migrate deploy`；每個測試前 TRUNCATE。併發測試同時送出、等全部結束、只檢查數量與最後狀態。

## F 映像與啟動順序 {span=2}
```flow LR
[(db：postgres)] -> [migrate：一次性]: service_healthy
[migrate：一次性] -> [api：USER node]: service_completed_successfully
[(db：postgres)] -> [api：USER node]: service_healthy
```
Dockerfile 分 build（`npm ci`、`prisma generate`、`nest build`）、deps（`npm ci --omit=dev`）、最後的映像（只複製 dist 與 node_modules）。migrate 用 build 階段（Prisma CLI 是 devDependency）。`.dockerignore` 排除 node_modules 與 .env；設定在執行時用環境變數給、啟動時驗證；`CMD ["node", "dist/main.js"]` 收得到 SIGTERM。

## G CI 與 README
```timeline
npm ci | lockfile 對不上就失敗
prisma generate | 後面的型別檢查要用
型別檢查 | Vitest 不檢查型別
migrate deploy | 全新資料庫從頭套用
npm test | 連 services 的 PostgreSQL
docker build | 標籤用 commit SHA
```
README 五段：如何執行（照著打得起來）、架構、API、測試、設計決定（寫取捨與理由）。部署：先 migration、成功才換新版；出事先回滾再修。
