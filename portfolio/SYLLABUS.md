# 作品專案課綱（地基版）

課名：**作品專案：從小專案到多租戶 SaaS 後台**
資料夾：`learn/portfolio/`（課文、`lab.js`、`index.html`、`sheets/`）。**本機練習借用 `nestjs/practice/`**（跟 auth 課一樣，`data-practice="nestjs" data-task="pfNN"`），不另開 `portfolio/practice/`，理由見「判分設計」。
19 課、4 個階段。標 ⏳ 的是寫那一課的人要自己再實測的項目；標【未驗證】的是這份課綱沒有實際跑過的說法。

---

## 全課共用

### 讀者與定位

- 讀者：每天寫 Vue 3 的前端工程師，學完 TypeScript、PostgreSQL、Node、NestJS（Prisma 7＋PostgreSQL）、auth、devops、system-design，目標轉職全端／後端。
- 這門課**不重教觀念**。每個觀念只寫一句回顧＋連結到教過的課（「auth 課第 20 課教過三道防線：…」），篇幅花在：
  1. **在自己的專案裡怎麼做**：檔案放哪、模組怎麼切、設定怎麼接；
  2. **怎麼組起來**：單獨學過的零件接在一起時才出現的問題（例如背景工作裡沒有請求，租戶上下文從哪來）；
  3. **取捨**：寫成 ADR，作品裡看得到「為什麼這樣選」。
- 讀者的程式寫在**自己的 repo**（不在 learn/ 裡），可以放履歷。learn/ 只放驗收測試、參考實作與課文。
- 跟期末專題的差別：nestjs 27、auth 26、devops 26、system-design 22、delivery 都是「在給好的咖啡店程式上修補或加功能」；這門課是**從空資料夾開始、自己決定結構**。所以不用咖啡店：階段 A 用「活動報名」，階段 B 讓讀者自選業務。（AUTHORING 的「情境用咖啡店」在這門課的例外：開場情境用讀者自己的專案；選擇題的情境用課程的示範模組 projects 或建議業務題目。）

### 建議順序（首頁與課程地圖都寫明）

- **階段 A（第 1～5 課）在 NestJS 課之後**：只需要 NestJS 課（含 Prisma、測試、Docker 服務）；第 4、5 課的 Docker 與 CI 用到的觀念會連到 devops 第 8～10、15～17 課，沒學過也做得完（課文就地講到夠用）。
- **階段 B（第 6～19 課）在 auth、devops、system-design 之後**：每一課都假設已學過對應的課，只回顧一句。
- `portfolio/index.html` 的地圖在階段 B 標題旁寫「先學完 auth、devops、system-design」。

### 版本（2026-11-19 在這台 Mac 確認）

| 東西 | 版本 | 出處／怎麼確認 |
|---|---|---|
| Node | 24.22.1（`nestjs/practice/package.json` engines `^22.22.3 \|\| ^24.15.0 \|\| >=26`） | `node -v`【已實測】 |
| NestJS | @nestjs/common／core／platform-express／testing 12.3.2；cli 12.0.11；schematics 12.0.12 | `nestjs/practice/package.json` |
| Prisma | prisma、@prisma/client、@prisma/adapter-pg **7.10.1**；pg 8.23.1 | 同上 |
| TypeScript | 6.0.3 | 同上 |
| 測試 | vitest 5.0.5、supertest 7.3.1、@types/supertest 7.2.1 | 同上 |
| 其他已裝的 Nest 套件 | @nestjs/jwt 12.0.3、@nestjs/config 12.0.1、@nestjs/swagger 12.0.5、@nestjs/terminus 12.1.0、@nestjs/throttler 6.7.1、@nestjs/bullmq 12.0.0（bullmq 6.5.3）、@nestjs/schedule 12.0.2、@nestjs/event-emitter 12.0.1、@nestjs/cache-manager 12.0.2、helmet 8.3.0、cookie-parser 1.4.7、class-validator 0.15.1、class-transformer 0.5.1、zod 4.6.7、ioredis 6.0.0、@types/multer 2.3.0 | 同上 |
| Docker | CLI 29.6.2、Compose v5.3.1、Engine 29.6.2 | `docker version`、`docker compose version`【已實測】 |
| PostgreSQL | `postgres:18.6-alpine`（learn-nestjs-postgres，127.0.0.1:5433） | `nestjs/practice/compose.yaml` |
| Redis | `redis:8.10.3-alpine`（127.0.0.1:6380） | 同上 |
| Mailpit（新增） | `axllent/mailpit:v1.33.1`（learn-nestjs-mailpit，網頁／API 127.0.0.1:8026、SMTP 127.0.0.1:1026）；API `GET /api/v1/search?query=to:"…"`、`GET /api/v1/message/{ID}` | `nestjs/practice/compose.yaml`【已實測】 |
| nodemailer（新增） | nodemailer 10.4.1、@types/nodemailer 8.0.2 | `nestjs/practice/package.json`【已實測：參考實作寄邀請信】 |
| GitHub CLI | 2.66.1（只給讀者自己用；判分不連網） | `gh --version` |

讀者自己的 repo：課文建議**跟 learn 的 nestjs/practice 用同一組版本**（第 1 課給一份 `package.json` 版本清單讓讀者鎖死），課文範例才對得上。讀者升級套件是他自己的事，驗收測試只看 HTTP 行為，不受影響。

### Prisma 7 寫課注意（2026-11-19 用 Prisma 7.10.1＋@prisma/adapter-pg 7.10.1＋PostgreSQL 18.6 實測）

實驗：非 superuser 角色連線、`projects` 開 ENABLE＋FORCE RLS，policy `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`（USING＋WITH CHECK），連線池 `max: 3`。結論：

1. **batch `$transaction([set_config(…, true), query(args)])` 可行**：Context7 查到的 Prisma 4～5 寫法在 7.10.1＋adapter-pg 照樣成立，兩句在同一條連線、同一個交易。60 個 A／B 交錯的請求沒有一個讀到別的租戶；WITH CHECK 擋得住寫入別的租戶；沒設上下文時 `count()` 是 0。
2. **兩層擴充可以疊**：內層「自動加 `where.tenantId`／`data.tenantId`」（第 8 課），外層「batch 交易＋set_config」（第 9 課），`query(args)` 進到 batch 裡照樣成立。參考實作 `portfolio-ref/saas/src/prisma/tenant-db.ts` 就是這樣寫。
3. **陷阱一：外層（batch）擴充過的 client 不能開互動式交易**。`xprisma.$transaction(async tx => { … })` 裡每個操作仍會經過擴充、各自開一個 batch 交易（另一條連線），**回滾不了**：實測在互動式交易裡 create 後 throw，資料還在。做法：互動式交易用「只有內層擴充」的 client，開頭自己 `set_config(…, true)` 一次（參考實作的 `TenantDb.tx()`）。`$allOperations` 的參數裡有 `__internalParams.transaction` 可以判斷是不是在交易裡，但那是內部 API，不要教。
4. **陷阱二：PrismaPromise 是 lazy 的**，`await` 時才執行，ALS（AsyncLocalStorage）也是那時才讀。`als.run(ctx, () => db.project.findMany())` 回傳的 promise 在 `run` 外面被 await，擴充讀不到租戶。要寫 `als.run(ctx, async () => await …)`。NestJS 的請求處理都在 middleware 開的 ALS 裡 await，不會遇到；worker、測試、腳本會。
5. **錯誤寫法 `set_config(…, false)`（session 層級）**：若同時拿掉交易（先 `$executeRaw` 設、再 `query(args)`），兩句可能拿到不同連線。實測：400 個交錯請求有 198 個讀到別的租戶，請求結束後連線上還留著上一個租戶。**第 9 課 `ex3-session-set` 用黑箱判得出來**：參考實作改成這樣後，煙霧測試「200 個交錯的 A、B 請求（同時 20 個）」失敗，其他 30 個測試照樣通過。只把 `true` 改成 `false`、但仍在 batch 交易裡的話，每個操作都會重設，黑箱判不出來；wrong 變體要用「拿掉交易」的版本。
6. **連線池與 batch 交易**：每個操作都開交易，突發流量超過連線池時，等不到連線的交易在 `maxWait`（預設 2 秒）後丟 `Transaction API error: Unable to start a transaction in the given time`（實測 400 個同時請求、池子 3 條）。測試的併發要用 `concurrent(n, total, fn)`（helpers/portfolio.ts）限制同時數量；macOS 一次開幾百條 TCP 連線也會 ECONNRESET。
7. Prisma 7.10.1 的 `migrate diff` **不管 CHECK 約束**：手寫在 migration 裡的 CHECK，之後 `migrate dev` 不會刪（實測 diff 是空的）。
8. 同一次查詢看到 Prisma 文件有 `contract-authoring/advanced-postgresql`（`db.ts`、`"pg/text@1"`）：那是 **Prisma Next** 的新寫法，不是 Prisma 7 ORM，**不要混用**。
9. 擴充後的 client 在 NestJS 裡：參考實作用一個 `@Injectable() TenantDb` 包起來（`client`、`scoped`、`tx()`），型別從 `ReturnType<typeof scoped>` 取，比 factory provider＋injection token 好懂。`PrismaService extends PrismaClient` 留著當 base client（健康檢查也用它）。

---

## 判分設計

### 結論

1. **平台功能訂一份固定的 API 契約**（`portfolio/CONTRACT-small.md`、`portfolio/CONTRACT-saas.md`），只規定路徑、方法、狀態碼、`errorCode`、少數必要欄位。業務模組不在契約裡。
2. **每個里程碑一組黑箱驗收測試**：Vitest＋`fetch`，對讀者啟動中的 API 打 HTTP。讀者執行 `node check.mjs nestjs pf08`。
3. **一份參考實作，兩個專案**：`nestjs/practice/portfolio-ref/small/`（階段 A 的活動報名）與 `nestjs/practice/portfolio-ref/saas/`（階段 B 最終版）。local-verify 把參考實作組進 verify 資料夾、啟動、跑同一組測試；`wrong/pfNN/exM-*/` 只放「蓋在參考實作上的壞檔案」。
4. **不新增 `portfolio/practice/`**：借 `nestjs/practice` 的 node_modules（不用再 npm install 一份 NestJS）、compose（PostgreSQL、Redis）、`prepare.mjs`（建判分資料庫、跑 migration、tsc）、`helpers/server.ts`（build＋start）。指令變成 `node check.mjs nestjs pfNN` 而不是 `node check.mjs portfolio NN`；這是 auth 課已經在用的模式（`data-task="auth21"`），check.mjs、local-verify.mjs **不用改**。

### 契約只規定什麼（寫課的人照這個原則加端點）

- 每個回應的錯誤格式：`{ statusCode, errorCode, message, requestId }`，`errorCode` 是 SCREAMING_SNAKE（跟 nestjs 第 8 課一致）。測試**只比對狀態碼與 errorCode**，不比對 message。
- ID 一律字串（UUID 或 cuid 都可以，測試不假設格式）。
- 列表一律 `{ items, nextCursor }`（游標分頁；nestjs 課與 node 第 14 課教過）。
- 路徑前綴 `/api/v1`；認證端點 `/api/v1/auth/*`；健康檢查 `/health/live`、`/health/ready`（不加前綴）。
- 契約裡的數字（免費方案上限、限流）是**契約的一部分**，固定寫死，測試才能驗；讀者可以在 README 說明正式環境會改成設定值。

### 測試怎麼找到要測的 API（`nestjs/practice/helpers/portfolio.ts`，新增）

```
target(import.meta.dirname, 'saas')  →  { api, repo, mailpit, db? }
```

| 測試所在資料夾 | 怎麼決定 | 用途 |
|---|---|---|
| `work/pfNN/`（讀者） | 讀 `nestjs/practice/work/portfolio.json`（gitignore 已涵蓋 `work/`）；環境變數 `PF_SMALL_API`、`PF_SAAS_API`、`PF_SAAS_REPO`… 優先。檔案不存在時**寫一份範本並讓測試失敗**，訊息說明要填什麼 | 讀者啟動自己的 API 後跑 |
| `verify/pfNN-…/` 且資料夾裡有 `src/main.ts` | 參考實作（answer 或 wrong 組出來的）：第一次呼叫 `build()`（有 `dist/main.js` 就略過），每個測試檔 `start()` 一次、`afterAll` 關掉；`repo` 就是這個資料夾 | local-verify 的 answer、wrong |
| `verify/pfNN-…/` 但沒有 `src/` | 直接丟錯「沒有可測的實作」 | local-verify 的「起始檔要失敗」 |

`portfolio.json` 範本：

```json
{
  "small": { "api": "http://localhost:3000", "repo": "/絕對路徑/event-signup" },
  "saas":  { "api": "http://localhost:3100", "repo": "/絕對路徑/my-saas",
             "mailpit": "http://localhost:8026",
             "appDatabaseUrl": "postgresql://app_user:…@localhost:5434/my_saas",
             "bolaProbes": [] }
}
```

### local-verify 怎麼組出參考實作

local-verify 照舊：`start/pfNN`（只有測試檔）→ `answer/pfNN`（只有一個 `reference.json`：`{ "ref": "saas" }`）→ `wrong/pfNN/exM-說明/`（`reference.json` 不用再放；只放要改壞的檔，例如 `src/projects/projects.service.ts`）。

**prepare.mjs 加一步（約 5 行）**：codeDir 裡有 `reference.json` 時，先 `cpSync(portfolio-ref/<ref>/, codeDir, { recursive: true, force: false })`。`force: false` 讓 wrong 的壞檔案留著、其他檔案從參考實作補齊。之後 prepare 原本的步驟自然接上：prisma generate、tsc、建 `nest_pfNN_…_test`、`prisma migrate deploy`、清 Redis 前綴。

- 讀者跑的 `work/pfNN/` 沒有 `reference.json`、沒有 package.json／prisma／tsconfig，prepare 原本的每一步都會略過。不需要動讀者的資料庫。
- 參考實作的 `tsconfig.json` 寫 `extends: "../../tsconfig.json"`：它只在被複製到 `verify/<題號>-…/`（兩層深）後才編譯，原地不編譯。
- **wrong 變體一定要能通過 tsc**，否則 prepare 失敗、所有測試都沒過，變體「被擋下」的理由是錯的。寫課的人跑 local-verify 時，看 wrong 的失敗訊息確認是預期的那個測試。⏳
- 參考實作是**最終版**，每個里程碑的測試都對它跑。所以測試一律「自己註冊新租戶、不超過免費方案上限、不累積到限流門檻」，後面的課加功能不會讓前面的測試壞掉。
- 平行執行：資料庫名稱、Redis 前綴照 `taskEnv`；上傳檔案放 `os.tmpdir()/learn-pf-<slug>`；Mailpit 共用，用「收件者 email 含 run id」區分；PostgreSQL 的 app 角色（RLS 用，叢集層級）在 migration 裡 `DO $$ … IF NOT EXISTS … $$` 建立，全部 verify 共用同一個角色名稱 `pf_app`。

### 讀者的資料不會互撞、可以重複跑

- 每次執行產生 run id（`Date.now().toString(36)＋pid`），email 一律 `pf-<runId>-<角色>@example.test`、租戶名稱帶 run id。結果（通過與否）每次一樣；資料在讀者的資料庫累積，課文教讀者需要時重建開發資料庫。
- 這是唯一偏離「每次結果都一樣、不依賴亂數」的地方：亂數只用在命名，不影響判定。
- 不測跟時間有關的行為（token 過期、邀請 72 小時失效）：黑箱沒辦法快轉讀者的時鐘。這些放進自評清單與選擇題。

### 灰箱：少數一定要看資料庫或 repo 才判得出來的

- **RLS（第 9 課）**：讀者在 `portfolio.json` 填 `appDatabaseUrl`（應用程式執行時用的角色），測試用 `pg` 直連：`rolsuper`、`rolbypassrls` 要是 false；每張有 `tenant_id` 的表 `relrowsecurity` 與 `relforcerowsecurity` 都要是 true；不設 `app.tenant_id` 時 `SELECT count(*)` 為 0；在交易裡 `set_config` 成 A 之後只看到 A 的列。測試只讀不寫。
- **repo 結構（第 1、4、5、17、19 課）**：讀 `repo` 路徑下的檔案。只檢查判得穩的：檔案存在、`docker compose -f <repo>/compose.yaml config --format json` 解析得出服務、Dockerfile 最後一個 stage 有非 root 的 `USER`、README 有指定的標題、`docs/adr/` 至少幾份且有「狀態／背景／決定／後果」。CI 的 YAML 不解析（沒有裝 YAML 套件，也不連 GitHub），只用文字檢查有沒有跑測試與 migration，其他放自評。
- **讀者自己的測試（第 3 課）**：在讀者 repo 執行 `npm test -- --reporter=json --outputFile=<暫存>`，要全部通過、至少 N 個測試、有 e2e 檔。**不做 mutation 判分**：讀者的檔案結構與寫法各不相同，`helpers/mutants.ts` 的字串替換套不上；改用自評清單裡的「故意改壞一行，看測試有沒有抓到」。

### BOLA 探針：讓自選的業務模組也被判分（第 18 課）

讀者在 `portfolio.json` 的 `bolaProbes` 登記自己業務模組的端點：

```json
{ "name": "工單", "create": { "path": "/api/v1/tickets", "body": { "title": "測試" } },
  "item": "/api/v1/tickets/:id", "update": { "body": { "title": "改" } } }
```

測試對每個探針：租戶 A 的 member 建立 → 租戶 B 的 owner `GET`／`PATCH`／`DELETE` 都要 404 →　A 的 viewer `PATCH`／`DELETE` 要 403 → 未登入 401 → A 自己讀得到（確認探針本身有效）。少於 2 個探針判失敗。參考實作用 projects 與 tags 當探針（files 的建立是 multipart，探針格式表達不了，所以參考實作多了一個只有名稱的 `tags` 模組）。

### 共用檔要改的地方（最小改動）

| 檔案 | 改什麼 | 大小 |
|---|---|---|
| `nestjs/practice/prepare.mjs` | 有 `reference.json` 時先把 `portfolio-ref/<ref>/` 補進 codeDir（force: false）；`ports` 加 `mailpit: 8026`（只在 `services` 有寫時檢查） | 約 6 行 |
| `nestjs/practice/compose.yaml` | 加 `mailpit` 服務（127.0.0.1:8026 網頁／API、127.0.0.1:1026 SMTP） | 約 10 行 |
| `nestjs/practice/package.json` | 加 `nodemailer`＋`@types/nodemailer`（參考實作寄邀請信；讀者專案也會用）【未驗證版本】 | 2 行＋lockfile |
| `nestjs/practice/helpers/portfolio.ts` | 新檔：`target()`、`runId()`、`signupTenant()`、`login()`、`mailpitLink()`、`expectError(res, status, code)`、`pollUntil()`、`repoFile()` | 新增 |
| `local.js` | `data-files` 空字串或省略時：不列「要改的檔案」、不顯示「看答案」，說明改成「在你的專案啟動 API 後，在 learn 資料夾執行：」 | 約 6 行 |
| `check.mjs` | （選用）start 資料夾只有測試檔時不印「打開裡面的檔案開始寫」 | 1 行 |
| `tests/local-verify.mjs` | **不用改** | — |
| `courses.js`、`index.html` | 加課程與建議順序 | — |

不用改 `tests/local-verify.mjs`：它從 `portfolio/lessons/*.html` 的 `data-practice="nestjs" data-task="pfNN"` 找題目，`node local-verify.mjs portfolio` 就會檢查 `nestjs/practice` 的 pf01～pf19。

### 每課的練習組成

- 本機驗收（`.local`，`data-files=""`）：2～4 題，一題一個 `exN.test.ts`。
- 選擇題 3 題（判斷題：取捨、哪裡會出事、先查什麼），情境用讀者專案或示範模組。
- **自評檢核清單**：`<h2>自評清單</h2>` 放在「常見錯誤」之前，用一般的 `<ul>`（不新增元件、不記進度），每項是「做到什麼、怎麼自己確認」，例如「把 `projects.service.ts` 的 tenant 條件刪掉，`npm test` 至少有一個測試失敗」。
- 階段最後一課照 AUTHORING 加「階段檢核」。
- 每課開頭的 callout「這課會用到」列出連結的既有課（下面各課的「連到」）。

### 寫課的人最容易踩的坑

- 測試沒過時，訊息要讓讀者分得出是「API 沒開」「網址填錯」還是「行為不對」：helper 第一次呼叫先打 `/health/live`，連不上就丟「連不到 http://localhost:3100：先在你的專案執行 npm run start:dev，或改 work/portfolio.json」。
- 不要在測試裡假設讀者用 cookie 還是 header 帶 refresh token 以外的任何實作細節；契約沒寫的不測。
- 參考實作的每一行都會被讀者當範本：照 nestjs、auth 課的寫法（全域 guard＋`@Public()`、權限沒宣告就拒絕、物件授權在 service）。
- 參考實作只用 nestjs/practice 已經裝的套件（＋nodemailer）。物件儲存用本機磁碟的 `StorageService`；課文講 S3／Garage 的 presigned URL 寫法並連到 data-stores 第 12 課，契約允許下載回 200 或 302。

---

## 階段 A：小專案走完一次（第 1～5 課，NestJS 課之後）

題目：**活動報名 API**（讀書會、工作坊這類小活動）。實體只有 `events`（標題、時間、名額）與 `registrations`（email、姓名）。夠小，卻有一個真的業務規則（名額不能超賣、同一個 email 不能重複報名），會用到交易、唯一約束與一致的錯誤格式。沒有登入（刻意：階段 A 只練架構流程，登入留到階段 B）。

小專案契約（`portfolio/CONTRACT-small.md`）：

| 端點 | 成功 | 錯誤 |
|---|---|---|
| `POST /api/v1/events` `{ title, startsAt, capacity }` | 201 `{ id, title, startsAt, capacity, remaining }` | 400 `VALIDATION_FAILED`（capacity 1～500、title 1～100 字、startsAt 是未來的 ISO 時間、多餘欄位） |
| `GET /api/v1/events?cursor=` | 200 `{ items, nextCursor }`，依 startsAt 排序 | 400 `VALIDATION_FAILED`（cursor 壞掉） |
| `GET /api/v1/events/:id` | 200（含 `remaining`） | 404 `EVENT_NOT_FOUND` |
| `POST /api/v1/events/:id/registrations` `{ email, name }` | 201 | 404、409 `EVENT_FULL`、409 `ALREADY_REGISTERED`（email 不分大小寫） |
| `DELETE /api/v1/events/:id/registrations/:regId` | 204，名額釋出 | 404 `REGISTRATION_NOT_FOUND` |
| `GET /health/live`、`/health/ready` | 200；ready 檢查資料庫 | ready 503 |

### 第 1 課　從需求到 schema：開一個新專案｜`01-requirements-to-schema.html`｜task pf01

- 範圍：
  1. 從一段需求寫出「實體、規則、API 契約」：哪些規則放資料庫約束（唯一、check）、哪些放程式（名額）。
  2. `nest new` 之後的資料夾結構：`src/<功能>/`、`prisma/`、`test/`、`.env.example`、`compose.yaml`（開發用 PostgreSQL，port 避開 learn 的 5433，建議 5434）；`package.json` 鎖版本（給一份清單）。
  3. Prisma 7 的 `prisma.config.ts`、`schema.prisma`、第一個 migration；`@@unique([eventId, email])`、`CHECK (capacity > 0)` 要手改 migration SQL（Prisma schema 寫不出 check）。
  4. 第一個端點只做到 `GET /health/live`、`/health/ready`，先確認整條路通（啟動、連資料庫、回應）。
  5. 第一次 commit 前：`.gitignore`、`.env` 不進 git。
- 本機驗收：ex1 `/health/live` 200、`/health/ready` 200 且 body 標示資料庫 up；ex2（repo）`prisma/migrations/*/migration.sql` 存在、含 `UNIQUE`（event＋email）與 `CHECK`（capacity）、`.env` 沒被 git 追蹤（`git -C <repo> ls-files .env` 為空）、`.env.example` 存在；ex3（repo）`compose.yaml` 經 `docker compose config` 解析出 postgres 服務且 port 只綁 127.0.0.1。
- wrong：`ex2-no-check`（migration 沒有 CHECK）、`ex2-env-not-ignored`（`.gitignore` 沒有 `.env`；verify 資料夾不是 git repo，所以 `git ls-files` 那項只在 repo 是 git repo 時檢查）、`ex3-public-port`（`5434:5432` 沒綁 127.0.0.1）。
- 選擇題：名額規則能不能只靠 check 約束（不行，要跨列計數）；email 唯一要不要 lower-case 存或用 citext（取捨）；ready 與 live 分開的理由。
- 連到：nestjs 1、4、11、12、13；postgresql 12、22；devops 10、11。
- ⏳ `nest new` 在 @nestjs/cli 12.0.11 產生的檔案（是否預設 ESM、Vitest 還是 Jest）；讀者要照 nestjs 課換成 Vitest 的步驟。

### 第 2 課　分層 API、驗證與錯誤格式｜`02-layers-validation-errors.html`｜task pf02

- 範圍：
  1. controller／service／資料存取的分工（只回顧 nestjs 18 一句）；這個大小的專案**不切 repository 介面**，直接在 service 用 Prisma，說明什麼時候才值得切。
  2. DTO＋全域 `ValidationPipe`（whitelist、forbidNonWhitelisted、transform）。
  3. 錯誤格式：domain error → filter → `{ statusCode, errorCode, message, requestId }`；Prisma P2002 轉 409、P2025 轉 404 的位置。
  4. 名額：交易裡 `SELECT … FOR UPDATE` 鎖活動列，或條件式 `UPDATE events SET remaining = remaining - 1 WHERE remaining > 0`；兩種寫法的取捨。
  5. 游標分頁。
- 本機驗收：ex1 驗證（每種壞輸入 400 `VALIDATION_FAILED`、多餘欄位被拒、錯誤回應有 requestId）；ex2 404／409 的 errorCode，重複報名 email 換大小寫也 409；ex3 **併發**：名額 3 的活動同時送 10 個報名，恰好 3 個 201、7 個 409 `EVENT_FULL`，`remaining` 為 0；取消後 `remaining` 回 1；ex4 分頁走完所有活動不重複不遺漏。
- wrong：`ex1-no-whitelist`、`ex2-p2002-500`（沒轉換成 409）、`ex2-case-sensitive`、`ex3-check-then-insert`（先 count 再 insert，沒鎖）、`ex3-no-release`（取消不還名額）、`ex4-offset-duplicates`（offset 分頁在插入時重複；測試在翻頁中間插入資料）。
- 選擇題：check-then-insert 為什麼在單機測試會過；P2002 該在哪一層轉；交易隔離拉到 SERIALIZABLE 夠不夠（要處理重試）。
- 連到：nestjs 7、8、14、15、18；postgresql 18、19、31、32；system-design 9（重複送出）。

### 第 3 課　測試：單元與 E2E｜`03-testing.html`｜task pf03

- 範圍：
  1. 哪些用單元測試（名額計算、錯誤轉換）、哪些用 E2E（整條 HTTP＋資料庫）；這個專案的測試金字塔長什麼樣。
  2. 測試資料庫：`.env.test`、每個測試檔前 truncate、為什麼不 mock Prisma。
  3. E2E 用 `Test.createTestingModule`＋supertest，跟 `main.ts` 共用 `configureApp()`（漏了就會測到另一套設定）。
  4. 併發測試怎麼寫才穩定（`Promise.all`＋檢查最終狀態）。
  5. `npm test` 一個指令跑完全部，為第 5 課的 CI 鋪路。
- 本機驗收：ex1 在讀者 repo 執行 `npm test`（JSON reporter）：全部通過、沒有 skip、至少 8 個測試、至少一個 `test/**/*.e2e-spec.ts`；ex2 測試名稱裡有涵蓋 EVENT_FULL、ALREADY_REGISTERED、VALIDATION_FAILED（用測試名稱文字比對，弱檢查，訊息寫明是提示）。
- wrong：`ex1-skip`（有 `it.skip`）、`ex1-no-e2e`、`ex1-failing`。
- 自評重點：故意把報名的鎖拿掉，自己的併發測試要失敗；把 `configureApp` 從 E2E 拿掉，驗證測試要失敗。
- 選擇題：mock Prisma 的單元測試全過、上線卻 500 的原因；E2E 為什麼要跟 main.ts 共用設定；併發測試偶爾失敗時先懷疑什麼。
- 連到：nestjs 5、10、17；node 22；delivery 6（壞掉的 CI）。
- ⏳ 在讀者 repo 跑 `npm test` 時用的是讀者自己的 node_modules 與 vitest.config：參考實作（small）要有自己的 vitest.config 與 `_spec` 資料庫設定，照 nestjs/practice 各題的寫法。

### 第 4 課　Docker 化：映像、Compose 與 migration｜`04-docker-compose.html`｜task pf04

- 範圍：
  1. 多階段 Dockerfile（建置 → 只留正式依賴 → 非 root），`prisma generate` 放哪個 stage。
  2. `compose.yaml` 兩個 profile／檔案：開發（只開資料庫）與「類正式」（api＋db＋healthcheck＋`depends_on: condition: service_healthy`）。
  3. migration 在哪裡跑：一次性的 `migrate` 服務，不是 api 啟動時（多副本會搶）。
  4. 設定從環境變數讀、啟動時驗證；SIGTERM 優雅關機。
- 本機驗收：ex1（repo）Dockerfile 至少兩個 `FROM`、最後一個 stage 有 `USER` 且不是 root／0、`.dockerignore` 排除 `node_modules`、`.env`；ex2（repo）`docker compose config --format json` 有 api、db、migrate 三個服務，api 依賴 db healthy 與 migrate `service_completed_successfully`；ex3（HTTP）讀者用 compose 啟動後，`portfolio.json` 的 `small.composeApi` 回 `/health/ready` 200（verify 時：⏳ 要不要真的 `docker build` 參考實作。建議 local-verify 也真的 build，時間另計；做不到就把 ex3 改成自評）。
- wrong：`ex1-root-user`、`ex1-single-stage`、`ex2-migrate-on-start`（api 的 command 裡跑 migrate deploy）、`ex2-no-healthcheck`。
- 選擇題：api 啟動時跑 migration 在 3 個副本時會怎樣；`depends_on` 沒有 condition 的後果；為什麼 `.env` 不能 COPY 進映像。
- 連到：nestjs 12、24；devops 7、8、9、10、11、17；node 21。
- ⏳ 這台 Docker Desktop 8 GB，build 參考實作的時間與記憶體。

### 第 5 課　CI、部署與 README：一個專案的完整樣子｜`05-ci-deploy-readme.html`｜task pf05

- 範圍：
  1. GitHub Actions：安裝 → lint → 型別 → 測試（PostgreSQL service container）→ build 映像；快取 npm。
  2. 部署（選做）：一句回顧 devops 16、18，給兩條路（單台 VM＋compose，或託管平台）與它們的費用與取捨；不在課文裡教一個特定平台的點擊步驟。
  3. README 的骨架：做什麼、怎麼跑（三個指令內）、架構、API、測試、設計決定；連 career 3。
  4. 回顧整個專案的檔案樹：每個檔案是哪一課、為什麼存在。這張樹就是階段 B 的起點。
- 本機驗收：ex1（repo）`.github/workflows/*.yml` 存在，文字含 `npm test`（或 `npm run test`）、`prisma migrate deploy`、`services:` 下有 postgres；ex2（repo）README 有「如何執行」「架構」「API」「測試」「設計決定」五個標題，且「如何執行」裡的指令在 repo 中存在對應檔案（compose.yaml、package.json 的 script）；ex3（選做，HTTP）`small.deployUrl` 有填時跑一組冒煙測試（health、建立活動、報名、409），沒填時這題顯示「選做，未填部署網址」並判為沒過（不影響其他題）。
- wrong：`ex1-no-migrate`、`ex1-no-db-service`、`ex2-missing-section`、`ex2-script-missing`（README 寫 `npm run db:up` 但 package.json 沒有）。
- 選擇題：CI 的測試要不要連真的 PostgreSQL；部署失敗時先回滾還是先修；README 寫多長。
- 階段檢核（5～8 題）：分層、錯誤格式、交易與鎖、測試策略、映像與 migration、CI。
- 連到：devops 14、15、16、17；career 3；engineering 7（技術寫作）。

---

## 階段 B：多租戶 SaaS 後台（第 6～19 課，auth、devops、system-design 之後）

### 業務題目（讀者自選一個；課程不規定細節）

1. **客服工單**：工單狀態機、指派、SLA 到期提醒（背景工作）、附件。
2. **預約排程**（教室、診所、會議室）：時段不能重疊（PostgreSQL 排除約束，postgresql 38）、取消政策、提醒信。
3. **進銷存**：品項、入出庫異動（只追加不修改）、庫存不能為負（交易與鎖）、月結報表匯出。

課程的**示範模組是 `projects`**（名稱、描述、封存）：每個 SaaS 都有的「頂層容器」，契約用它示範隔離、RBAC、方案上限、稽核、檔案、匯出。讀者的業務模組掛在 project 底下或獨立都可以；每課最後一節「套到你的業務模組」說明同一件事在三個建議題目裡各要注意什麼。

### SaaS 契約（`portfolio/CONTRACT-saas.md`，第 6 課公布，之後各課只會**加**端點）

角色：`owner` ＞ `admin` ＞ `member` ＞ `viewer`。租戶由 access token 決定（auth 20：不信任請求送來的租戶 ID）；同一個人屬於多個租戶時用 `switch-tenant` 換 token。

| 課 | 端點 | 重點狀態碼／errorCode |
|---|---|---|
| 7 | `POST /api/v1/auth/signup` `{ email, password, name, tenantName }`（建立使用者＋租戶＋owner） | 201；409 `EMAIL_TAKEN`；400 |
| 7 | `POST /api/v1/auth/login` | 200 `{ accessToken }`＋refresh cookie（HttpOnly、Secure 在本機可省略、SameSite、Path 限 `/api/v1/auth`）；401 `INVALID_CREDENTIALS`（不存在與密碼錯一樣） |
| 7 | `POST /api/v1/auth/refresh`、`POST /api/v1/auth/logout` | 輪替；舊的再用一次 → 401 `REFRESH_REUSED` 且整個家族失效 |
| 7 | `GET /api/v1/me` | `{ user, tenant, role }` |
| 8 | `POST/GET /api/v1/projects`、`GET/PATCH/DELETE /api/v1/projects/:id` | 別的租戶的 ID 一律 404 `NOT_FOUND`（不是 403） |
| 10 | `GET /api/v1/members`、`PATCH /api/v1/members/:userId` `{ role }`、`DELETE /api/v1/members/:userId` | 403 `FORBIDDEN`；409 `LAST_OWNER` |
| 10 | `POST /api/v1/invitations` `{ email, role }`、`GET`、`DELETE /:id`；`POST /api/v1/auth/invitations/accept` `{ token, name?, password? }`；`GET /api/v1/auth/tenants`、`POST /api/v1/auth/switch-tenant` `{ tenantId }` | 403（不能邀請比自己高的角色）；410 `INVITATION_USED`／`INVITATION_REVOKED`；switch 到不是成員的租戶 403 |
| 11 | `GET /api/v1/audit-logs?action=&cursor=`（admin 以上） | 條目 `{ id, actorId, action, targetType, targetId, requestId, createdAt }` |
| 12 | `POST /api/v1/projects/:id/files`（multipart，欄位 `file`）、`GET /api/v1/files/:id`、`GET /api/v1/files/:id/content`、`DELETE` | 413 `FILE_TOO_LARGE`（5 MB）；415 `UNSUPPORTED_FILE_TYPE`（依內容判斷，不信副檔名）；content 回 200 或 302 |
| 13 | `POST /api/v1/exports` `{ type: "projects" }`、`GET /api/v1/exports/:id`、`GET /api/v1/exports/:id/content` | 202 `{ id, status: "queued" }`；status `queued/running/done/failed` |
| 14 | `GET /api/v1/billing`、`POST /api/v1/billing/plan` `{ plan }`（owner；模擬升級，不接金流） | 免費方案：3 個 project、5 位成員（含待接受邀請）、20 MB 檔案；超過 403 `PLAN_LIMIT_REACHED`；每租戶每分鐘 300 個請求，超過 429 `RATE_LIMITED`＋`Retry-After` |
| 15 | `GET /openapi.json`、`/docs` | — |
| 16 | 每個回應帶 `x-request-id`（收到合法的就沿用）；`/health/ready` 檢查 db 與 redis | 500 一律 `INTERNAL_ERROR`，不帶 stack |

權限矩陣（契約的一部分）：viewer 只能讀；member 可以建立、修改 project 與檔案、匯出；admin 另外管理成員與邀請、讀稽核、刪除 project；owner 另外管方案、可以指定 owner。最後一位 owner 不能被降級或移除。

### 階段 B1：平台地基（第 6～10 課）

#### 第 6 課　作品規劃：範圍、架構與第一份 ADR｜`06-plan-the-saas.html`｜task pf06

- 範圍：
  1. 作品要展示什麼（面試官 10 分鐘內看得到的東西）；範圍切法：平台功能照契約做完整，業務模組做「一條有深度的流程」而不是很多 CRUD。
  2. 選業務題目：三個建議各自的難點與它在面試能講的故事。
  3. 模組地圖：`auth`、`tenancy`、`members`、`audit`、`files`、`jobs`、`billing`、`<業務>`；誰可以依賴誰（nestjs 26 的依賴方向）。
  4. ADR 格式與第一份 ADR：「租戶隔離方式」（共用表＋tenant_id、schema、資料庫的取捨，只回顧 auth 20 一句，決定寫在自己的 ADR）。
  5. 從階段 A 的骨架開新 repo；`portfolio.json` 的 saas 區段。
- 本機驗收：ex1（HTTP）`/health/live`、`/health/ready`、未知路徑 404 的錯誤格式含 `errorCode`、`requestId`；ex2（repo）`docs/adr/0001-*.md` 有狀態、背景、決定、後果四段；`docs/architecture.md`（或 README 架構段）存在。
- wrong：`ex1-default-404`（Nest 預設錯誤格式）、`ex2-adr-no-consequences`。
- 選擇題：業務模組做 10 個 CRUD 還是 1 條深流程；ADR 寫在哪、什麼時候改（不改，寫新的取代）；什麼情況才選每租戶一個資料庫。
- 連到：auth 20；system-design 1、15、18；nestjs 26；career 3、6；engineering 1、2。

#### 第 7 課　帳號、租戶與 token｜`07-signup-login-refresh.html`｜task pf07

- 範圍：
  1. schema：`tenants`、`users`（email 全域唯一）、`memberships`（user×tenant×role）；為什麼 role 放 membership 不放 user。
  2. 註冊＝一個交易建立 user＋tenant＋owner membership。
  3. access token 帶 `sub`、`tid`、`ver`；refresh token 存雜湊、家族、輪替與重用偵測（只回顧 auth 10、21 一句，重點是放進自己的模組結構）。
  4. 全域 guard＋`@Public()`；cookie 設定。
  5. 登入限流（以 email＋IP），契約只要求「連續失敗會 429」，門檻讀者決定（測試只打 20 次）。
- 本機驗收：ex1 signup／login／me，`INVALID_CREDENTIALS` 不分帳號不存在或密碼錯、回應時間不做判斷（太不穩）；ex2 refresh 輪替、舊 token 再用 401 `REFRESH_REUSED`、之後新 token 也失效、logout 後 refresh 401；ex3 沒有 token、壞 token、`alg: none`、別的金鑰簽的 token 都 401；cookie 屬性 HttpOnly、SameSite、Path；ex4 同一 email 連續錯 20 次至少出現一次 429。
- wrong：`ex1-user-enumeration`、`ex2-no-reuse-detection`、`ex2-refresh-not-rotated`、`ex3-cookie-not-httponly`、`ex3-accept-none`（verify 沒鎖 algorithms）、`ex4-no-throttle`。
- 選擇題：tenantId 放 token 裡，成員被移除後怎麼辦（第 10 課的伏筆：每個請求查 membership 或 token version）；refresh token 為什麼存雜湊；access token 15 分鐘還是 24 小時。
- 不能重複：auth 21 練習 1～5 的實作題（argon2id 參數、JwtModule 設定、refresh 家族的單元題）——這課只做組裝與黑箱驗收，課文不要再出同樣的實作題。
- 連到：auth 3、4、8、9、10、11、16、21；nestjs 6、11；system-design 10。

#### 第 8 課　租戶隔離（一）：上下文與 Prisma extension｜`08-tenant-isolation-prisma.html`｜task pf08

- 範圍：
  1. 請求 → guard 解出 `tid` → `AsyncLocalStorage` 的租戶上下文；找不到租戶一律失敗（fail closed）。
  2. Prisma 7 client extension：讀取類操作自動加 `where.tenantId`、建立時自動填；`findUnique` 的陷阱（要改複合唯一鍵 `@@unique([tenantId, id])` 或改 `findFirst`）；`$queryRaw` 不會經過 extension。
  3. 擴充後的 client 怎麼在 NestJS 注入（factory provider，型別從 `ReturnType` 取）。
  4. 複合外鍵：子表參照 `(tenant_id, project_id)`，資料庫擋跨租戶參照。
  5. 示範模組 projects；「套到你的業務模組」。
- 本機驗收：ex1 兩個租戶各建 project，列表只看到自己的、`GET/PATCH/DELETE` 別人的 404（也確認別人的資料沒被改）；ex2 建立時 body 帶 `tenantId: <別的租戶>` 被拒（400 或被忽略後仍屬於自己，二擇一都算對，但資料一定在自己的租戶）；ex3 分頁游標用別的租戶的 ID 當 cursor 不會洩漏資料。
- wrong：`ex1-findunique-unscoped`（extension 沒涵蓋 findUnique）、`ex1-update-unscoped`（update／delete 沒加條件）、`ex1-tenant-from-header`（從 `x-tenant-id` 取）、`ex2-mass-assign-tenant`、`ex3-cursor-leak`。
- 選擇題：extension 管不到哪些查詢；跨租戶回 404 還是 403；AsyncLocalStorage 在哪些地方會斷（背景工作、事件）。
- 不能重複：auth 20 練習 1（自動加租戶條件的 repository）——那題是純 TS 的 repository；這課是 Prisma 7 extension 在真的 NestJS 專案裡，不要再出「寫一個 TenantRepository」。
- 連到：auth 19、20；postgresql 8、38；nestjs 13、14、18；node 8（AsyncLocalStorage 若有教到 ⏳ 確認出處）。
- ⏳ 見上方「Prisma 7 寫課注意」。

#### 第 9 課　租戶隔離（二）：PostgreSQL RLS 當第二道防線｜`09-rls-defense-in-depth.html`｜task pf09

- 範圍：
  1. 兩個資料庫角色：migration 用的擁有者、執行時用的 `app_user`（非 superuser、非 BYPASSRLS）；連線字串兩個。
  2. migration 裡 `ENABLE`＋`FORCE ROW LEVEL SECURITY`、policy 用 `NULLIF(current_setting('app.tenant_id', true), '')::uuid`。
  3. 在 extension 裡每個操作包交易＋`set_config('app.tenant_id', …, true)`；互動式交易（`$transaction(async tx => …)`）要另外設；效能代價。
  4. 登入、註冊、接受邀請這些「還沒有租戶」的路徑怎麼辦（明確的系統上下文，不是關掉 RLS）。
  5. 取捨寫成 ADR 0002：只用 extension、只用 RLS、兩者都用。
- 本機驗收（灰箱，用 `appDatabaseUrl`）：ex1 `app_user` 不是 superuser、沒有 BYPASSRLS、不是那些表的擁有者；ex2 每張有 `tenant_id` 的表 RLS 啟用且 FORCE；ex3 沒設 `app.tenant_id` 時查詢回 0 列、設成租戶 A 只看到 A（先用 API 建資料）、設成 A 時 `INSERT` 一筆 B 的資料被 policy 擋（WITH CHECK；在交易裡做完 ROLLBACK，不留資料）；ex4（HTTP）第 8 課的隔離測試全部仍然通過（RLS 開了之後註冊、登入沒有壞）。
- wrong：`ex1-owner-connection`（app 用擁有者連線）、`ex2-no-force`、`ex3-session-set`（`set_config(…, false)`：判法 ⏳ 用同一個連線池連續交錯 A、B 請求 200 次，看會不會讀到另一個租戶；或改成檢查 extension 原始碼——寫課的人實測後決定）、`ex3-no-with-check`、`ex4-signup-broken`（RLS 擋住註冊）。
- 選擇題：有了 extension 還要 RLS 嗎（回顧 auth 20 練習 5 的結論，**換情境**：報表用 `$queryRaw`）；PgBouncer transaction 模式下 `SET` 與 `SET LOCAL`；RLS 開了之後某個 API 突然回空陣列，先查什麼。
- 不能重複：postgresql 24 練習 1～4、38 練習 5（SQL 層的 policy 與測試函式）；auth 20 練習 5、auth 21 練習 13 的選擇題情境。
- 連到：postgresql 24、36、38；auth 20、21；devops 11（兩組帳密的 secret 管理）。

#### 第 10 課　成員、邀請與租戶內 RBAC｜`10-members-invitations-rbac.html`｜task pf10

- 範圍：
  1. 邀請流程：token 存雜湊、一次性、會過期、可撤銷；信用 Mailpit 收（compose 加服務）；連結的網址來自設定，不來自請求的 Host。
  2. 已有帳號與新帳號接受邀請的兩條路；接受後加入 membership；`switch-tenant`。
  3. 權限：`@Permissions('members:write')`＋guard 查 membership 的角色（每個請求查資料庫或快取，**不信 token 裡的角色**）；權限沒宣告就拒絕。
  4. 角色規則：不能指派比自己高的角色、最後一位 owner、自己降級自己。
  5. 成員被移除後，他手上還有效的 access token 立刻失去這個租戶的存取。
- 本機驗收：ex1 邀請 → 從 Mailpit 取連結 → 接受 → 新成員 `me` 的租戶與角色正確；同一 token 再用 410；撤銷後用 410；ex2 權限矩陣：viewer／member／admin／owner 對 members、invitations、projects 各端點的狀態碼表（資料驅動測試，失敗訊息印出哪一格不對）；ex3 admin 邀請 owner 403、降級最後一位 owner 409 `LAST_OWNER`；ex4 移除成員後，他原本的 access token 打 `/projects` 得到 401 或 403（不能是 200）；他屬於兩個租戶時 switch 到被移除的那個 403。
- wrong：`ex1-token-reusable`、`ex1-host-header-link`、`ex2-role-from-jwt`、`ex2-undeclared-allowed`、`ex3-escalate`、`ex3-remove-last-owner`、`ex4-stale-membership`。
- 選擇題：角色放 token 省一次查詢的代價；邀請連結用請求的 Host 會怎樣；RBAC 不夠時何時換 ABAC／ReBAC。
- 不能重複：auth 18 的 RBAC 練習、auth 21 練習 3、auth 26 練習 4（忘記密碼的 token 流程）——課文用一句話回顧 token 的四個條件，不再出實作題。
- 連到：auth 16、18、19、20、21、26；nestjs 6、20（寄信放佇列，選做）。
- 階段 B1 結尾：階段檢核 5～8 題（租戶從哪來、extension 與 RLS、FORCE、token 裡的角色、邀請 token）。

### 階段 B2：平台功能（第 11～14 課）

#### 第 11 課　稽核紀錄｜`11-audit-log.html`｜task pf11

- 範圍：
  1. 記什麼（誰、對什麼、做了什麼、從哪個請求）、不記什麼（密碼、token、個資的值）。
  2. 寫在**同一個交易**裡（業務改了、稽核沒寫 → 不能發生）；service 明確呼叫，還是 Prisma extension／trigger 自動記：取捨。
  3. 只能追加：資料庫層撤銷 `app_user` 的 UPDATE／DELETE。
  4. 查詢 API：租戶隔離、admin 以上、游標分頁、依 action 篩選。
  5. 保存期限與匯出（寫在 ADR，不實作）。
- 本機驗收：ex1 建立、修改、刪除 project，改成員角色、邀請、接受邀請，各自出現一筆對應 action（契約列出 action 名稱：`project.created`…`member.role_changed`），actor 與 requestId 正確（requestId 等於當次回應的 `x-request-id`）；ex2 租戶 B 看不到 A 的紀錄、viewer／member 403；ex3 失敗的操作（403、驗證失敗）**不**寫成功紀錄；ex4（灰箱）`app_user` 對稽核表沒有 UPDATE、DELETE 權限。
- wrong：`ex1-missing-role-change`、`ex2-unscoped`、`ex2-member-can-read`、`ex3-log-before-check`、`ex4-mutable`。
- 選擇題：稽核寫在交易外（事件、佇列）會漏什麼；trigger 記稽核拿不到 actor 怎麼辦（`set_config` 帶 user id）；稽核表會長很大時怎麼辦（分割，postgresql 35）。
- 不能重複：postgresql 38 練習（稽核 trigger 函式的 SQL 題）。
- 連到：postgresql 23、35、38；auth 23（敏感資料）；nestjs 9、24；devops 21。

#### 第 12 課　檔案上傳｜`12-file-uploads.html`｜task pf12

- 範圍：
  1. 兩種架構：經過 API（multer，串流到儲存）與 presigned URL 直傳；作品選哪個、ADR。
  2. 儲存的 key 一律 `tenants/<tenantId>/…`＋隨機 ID，不用使用者給的檔名；資料庫存 metadata。
  3. 驗證：大小（在讀完之前就擋）、型別看內容的 magic bytes、下載用 `Content-Disposition: attachment` 與正確的 `Content-Type`、`X-Content-Type-Options: nosniff`。
  4. 用量計入方案（第 14 課接上）。
  5. 刪除：先刪 metadata 還是先刪物件；孤兒清理交給排程。
- 本機驗收：ex1 上傳 PNG 成功，metadata 正確，`content` 下載的位元組與原檔一致（跟著 302 走）；ex2 6 MB 回 413、把 HTML 改名成 `.png` 回 415；ex3 B 租戶讀 A 的檔案 metadata 與 content 都 404，用 A 的 project ID 上傳到 B 的租戶 404；ex4 下載回應有 `attachment` 與 `nosniff`，檔名有中文時 `filename*` 正確。
- wrong：`ex1-trust-filename`（檔名當 key，路徑穿越 `../`）、`ex2-extension-check`、`ex2-size-after-buffer`（判法：⏳ 上傳 50 MB 時伺服器記憶體或時間；不穩就只看狀態碼）、`ex3-content-unscoped`、`ex4-inline`。
- 選擇題：presigned URL 的權限檢查在哪一步；檔案 key 用原檔名的風險；刪除順序。
- 不能重複：data-stores 12 的 createUpload、confirmUpload、getReceiptUrl、lifecycle；nestjs 22 的上傳練習。
- 連到：nestjs 22；data-stores 12；auth 7（上傳的 HTML 造成 XSS）、22；aws（S3，選讀）。

#### 第 13 課　背景工作：匯出｜`13-background-jobs.html`｜task pf13

- 範圍：
  1. API 回 202＋工作 ID，worker（BullMQ）處理；job 資料只放 ID 與 `tenantId`，不放整份資料。
  2. worker 裡沒有請求：用 job 的 `tenantId` 重建租戶上下文（同一個 ALS＋extension＋RLS），而不是用「系統身分」繞過。
  3. 冪等與重試：同一個匯出重跑結果一樣；失敗狀態與錯誤訊息。
  4. worker 與 api 同一個程序還是分開（ADR）；優雅關機。
  5. 匯出結果存進第 12 課的儲存、計入用量。
- 本機驗收：ex1 `POST /exports` 202，輪詢到 `done`（最多 15 秒），CSV 內容只有自己租戶的 project（測試先讓另一個租戶建 project，確認不在裡面）、標題列正確、逗號與換行有跳脫；ex2 B 讀 A 的匯出 404（狀態與內容都是）；ex3 viewer 403、member 202；ex4 CSV injection：名稱以 `=` 開頭的 project 匯出後被跳脫（前置 `'`）。
- wrong：`ex1-worker-no-tenant`（worker 用沒有租戶的 client：RLS 開著時會匯出 0 筆、沒開時匯出全部；兩種都被 ex1 擋）、`ex1-no-escape`、`ex2-status-unscoped`、`ex4-formula`。
- 選擇題：job 資料放整份 project 列表的問題；worker 重試時重複寄信怎麼辦；佇列塞住時 API 該怎麼回。
- 不能重複：auth 20 練習 3（月報表背景工作的租戶上下文）——那題是選擇／小題；這課是真的 BullMQ worker，課文回顧結論即可，不再出同樣的題。nestjs 20、27 的 worker 冪等練習。
- 連到：nestjs 20、21、24；system-design 9、12；auth 20；postgresql 33。

#### 第 14 課　方案、用量限制與限流｜`14-plans-limits.html`｜task pf14

- 範圍：
  1. 方案設定放哪裡（程式常數、資料表、設定檔）；這個作品用程式常數＋`tenants.plan`，ADR 說明。
  2. 用量檢查的競態：兩個請求同時建立第 3 個 project。做法：交易＋鎖租戶列、條件式更新計數器、或計數查詢＋SERIALIZABLE；選一個並說明。
  3. 待接受的邀請算不算成員數；降級方案時超出的資料怎麼辦（不刪，只禁止新增）。
  4. 每租戶限流（@nestjs/throttler＋Redis storage，tracker 用 tenantId）與登入限流的差別；`Retry-After`。
  5. 接真的金流是下一步：一句話指到 nestjs 22（webhook）與 delivery 8（付款），不在這課做。
- 本機驗收：ex1 免費方案第 4 個 project 403 `PLAN_LIMIT_REACHED`；升級 pro 後可以建立；ex2 **併發**：已有 2 個 project 時同時送 10 個建立，最後恰好 3 個；ex3 成員上限把待接受邀請算進去；ex4 同一租戶一分鐘內第 301 個請求 429 且有 `Retry-After`，**另一個租戶同時不受影響**（測試只打輕量端點 `/api/v1/me`）；ex5 `GET /billing` 的 usage 數字與實際一致。
- wrong：`ex1-member-can-upgrade`、`ex2-count-then-create`、`ex3-ignore-invitations`、`ex4-global-limit`（以 IP 或全域計數）、`ex4-no-retry-after`。
- 選擇題：計數器欄位和 `count(*)` 的取捨；限流放 API 還是 gateway；超出方案時回 403、402 還是 429（契約選 403＋errorCode 的理由）。
- 不能重複：system-design 10 的限流演算法實作題。
- 連到：system-design 10、11；postgresql 19、31、32；nestjs 15、19；auth 20（雜訊鄰居）。
- 階段 B2 結尾：階段檢核。

### 階段 B3：上線與作品（第 15～19 課）

#### 第 15 課　OpenAPI：把契約交給前端｜`15-openapi-contract.html`｜task pf15

- 範圍：
  1. @nestjs/swagger 的 CLI plugin、DTO 即文件；錯誤格式的共用 schema；bearer 與 cookie 兩種 security scheme。
  2. 每個端點列出可能的錯誤狀態碼。
  3. 給 Vue 前端產生型別（openapi-typescript 這類工具，**課文只示範指令，不加進 nestjs/practice**【未驗證工具版本】）。
  4. CI 檢查「OpenAPI 有沒有不相容的變更」（概念＋指到 api-styles 10）。
- 本機驗收：ex1 `/openapi.json` 是 OpenAPI 3.x，包含契約的每一個路徑與方法；ex2 受保護的端點有 security、`/auth/login` 沒有；每個端點至少文件化 401／403／404 其中適用的那些，且引用同一個錯誤 schema（含 `errorCode`）；ex3 production 模式（`NODE_ENV=production`）下 `/docs` 是否開放由讀者決定，但 `openapi.json` 裡不能出現範例 secret、內部 URL（掃描 `localhost`、`password` 範例值）。
- wrong：`ex1-missing-routes`（漏掉 controller 沒加 plugin 的端點）、`ex2-no-security`、`ex2-inline-errors`。
- 選擇題：程式產生文件還是文件先行；欄位改名算不算破壞性變更；文件開在正式環境的風險。
- 連到：nestjs 23；api-styles 10；system-design 19；node 14。

#### 第 16 課　可觀測性：從一個 requestId 查到底｜`16-observability.html`｜task pf16

- 範圍：
  1. 結構化 log 每行帶 `requestId`、`tenantId`、`userId`；不記 token 與密碼（redact）。
  2. `x-request-id` 進出、傳進 job、寫進稽核。
  3. live／ready、優雅關機；ready 檢查 db 與 redis。
  4. 指標與追蹤：作品要做到哪裡（建議：log＋health 必做，OpenTelemetry 選做並寫 ADR）。
  5. 錯誤：500 不洩漏內部訊息；未預期錯誤只 log 一次。
- 本機驗收：ex1 回應都有 `x-request-id`；送合法的 id 會被沿用、送 300 字或含換行的會被換掉；ex2 錯誤回應的 `requestId` 等於標頭；ex3 送壞掉的 JSON body 得到 400，回應不含 stack、`SyntaxError` 原文以外的內部資訊（不在契約裡加測試用的 500 後門；⏳ 寫課的人若找到不需要後門的 500 觸發法再加）；ex4 `/health/ready` 在 db、redis 都正常時 200，body 列出兩者。
- wrong：`ex1-trust-any-id`（log injection）、`ex2-mismatch`、`ex3-leak-stack`、`ex4-ready-no-redis`。
- 選擇題：log 印出完整 request body 的風險；ready 失敗時 Kubernetes／負載平衡器會怎樣；requestId 用 AsyncLocalStorage 而不是參數傳遞的理由。
- 連到：nestjs 24、25；node 19、21；devops 21、22、23、25；system-design 21。

#### 第 17 課　CI/CD 與部署｜`17-ci-cd-deploy.html`｜task pf17

- 範圍：
  1. CI：lint、型別、單元、E2E（真的 PostgreSQL＋Redis service）、跨租戶測試、建映像、掃描依賴與映像。
  2. CD：映像標籤用 commit SHA；migration 是獨立步驟且向後相容（expand／contract）；api 與 worker 兩個服務。
  3. 部署目標（讀者自選）＋secret 管理；部署後自動跑冒煙測試；回滾。
  4. 給面試官的 demo 環境：重設資料的排程、示範帳號、不放真實個資。
- 本機驗收：ex1（repo）workflow 含測試、migration、build 映像；compose 的類正式設定有 api、worker、migrate、db、redis、mailpit（開發）；ex2（repo）Dockerfile 非 root、`HEALTHCHECK` 或 compose healthcheck；ex3（選做，HTTP）`saas.deployUrl` 有填時跑冒煙：health、signup、login、建立 project、跨租戶 404、HTTPS（網址是 https）、`Strict-Transport-Security` 標頭。
- wrong：`ex1-no-worker`、`ex1-tests-skipped-in-ci`（workflow 裡 `continue-on-error`）、`ex2-root`。
- 選擇題：migration 刪欄位與程式部署的順序；用 `latest` 標籤部署的問題；demo 環境要不要開放註冊。
- 不能重複：devops 15、16、17、26 的實作題（workflow 填空、藍綠切換、migration 順序）——這課只驗讀者 repo 的組合結果。
- 連到：devops 9、15、16、17、18、20、24；system-design 19；kubernetes（選讀）。

#### 第 18 課　資安檢查：用探針攻擊自己的作品｜`18-security-review.html`｜task pf18

- 範圍：
  1. 威脅模型（一頁）：資產、入口、信任邊界；只回顧 auth 25 的方法，重點是填自己的作品。
  2. BOLA 探針：把業務模組登記進 `bolaProbes`；同時在自己 repo 寫一份「跨租戶 E2E 測試」，每加一個端點就要加一列。
  3. OWASP API Top 10 逐項對照自己的作品（表格），每項指到對應的測試或 ADR。
  4. 安全標頭、CORS 白名單、請求大小上限、錯誤不洩漏、依賴掃描。
  5. 把找到的問題寫成 issue 與修補 commit（作品裡看得到「我找到並修了」）。
- 本機驗收：ex1 BOLA 探針（見「判分設計」），至少 2 個業務模組端點；ex2 mass assignment：`PATCH /me`、`PATCH /members/:id`、`POST /projects` 送 `tenantId`、`role`、`plan`、`isPlatformAdmin` 都不生效；ex3 安全標頭（helmet 預設那幾個）、CORS：設定外的 Origin 不回 `Access-Control-Allow-Origin`、預檢允許的 origin 只來自設定；JSON body 超過 1 MB 回 413；ex4 錯誤回應（404、400、409）不含 `Prisma`、`at `、資料表名稱。
- wrong：`ex1-business-unscoped`（參考實作的 tags 探針故意漏掉 tenant 條件：tags 的 service 改用 `PrismaService` 直接查，同時要繞過 RLS 才判得出來，見寫課者 checklist）、`ex2-role-mass-assign`、`ex3-cors-reflect`、`ex3-no-body-limit`、`ex4-leak-prisma`。
- 選擇題：SAST／DAST 都綠還要不要跨租戶測試（**換情境**，不能跟 auth 26 練習 16 一樣）；BOLA 測試該寫在哪一層；發現漏洞但時間只夠修一個時怎麼排。
- 不能重複：auth 24、26 的修補題（ex1～ex7 的情境：405 vs 404、欄位層級、忘記密碼、暴力破解、SSRF、CORS 寫死）——這課是對「讀者自己的作品」跑探針，不出修補題。
- 連到：auth 7、19、22、24、25、26；devops 9（映像掃描）；system-design 20。

#### 第 19 課　包裝作品：README、架構圖、ADR 與 demo｜`19-package-the-portfolio.html`｜task pf19

- 範圍：
  1. README 的順序：一句話、demo 連結與示範帳號、架構圖、功能清單（平台／業務）、設計決定（連 ADR）、怎麼跑、怎麼測、已知限制與下一步。
  2. 架構圖：元件圖（api、worker、db、redis、storage、mail）＋一張請求時序（帶租戶的請求從 guard 到 RLS）；用 Mermaid 放在 repo。
  3. ADR 清單至少：隔離方式、RLS、token 設計、檔案儲存、背景工作部署、方案與限流。
  4. demo 腳本（3 分鐘）與面試時的講法：挑 2 個取捨講深；被問「還差什麼才能上正式」怎麼答。
  5. 公開前檢查：git 歷史裡的 secret、示範資料沒有真實個資、授權。
- 本機驗收：ex1（repo）README 有指定標題、有 Mermaid 區塊、連到的 `docs/adr/*.md` 都存在；ex2（repo）`docs/adr/` 至少 5 份且格式完整、檔名編號連續；ex3（repo）`git -C <repo> log -p` 掃描常見 secret 樣式（AWS key、`-----BEGIN`、`sk_live_`）不得出現；ex4 全部前面里程碑的 HTTP 測試一次跑完（回歸）。
- wrong：`ex1-broken-adr-link`、`ex2-adr-gap`、`ex3-secret-in-history`（verify 不是 git repo：⏳ 這題在 verify 時改掃工作目錄檔案，或在 helper 裡 `git init` 一個暫存 repo 再 commit；寫課的人決定）。
- 選擇題：README 先放架構圖還是安裝步驟；作品放 10 個功能還是 3 個有深度的；面試官問「為什麼不用每租戶一個資料庫」怎麼答。
- 階段檢核（全課）：5～8 題，涵蓋隔離、token、背景工作的租戶上下文、用量競態、稽核交易、BOLA 測試。
- 不能重複：career 3 練習 1～3（README 骨架、作品卡）——這課驗讀者自己的 repo，不再出寫 README 的填空題。
- 連到：career 2、3、6、7；system-design 18；engineering 7；devops 26。

---

## 不能重複（總表）

| 既有課 | 這門課不能再出的題 |
|---|---|
| auth 18、20、21、24、26 | RBAC 實作題、TenantRepository、快取 key、月報表背景工作、header 租戶選擇題、RLS vs repository 選擇題（練習 5）、客服跨租戶；auth 21 的 argon2id／JwtModule／refresh 實作；auth 26 的 7 個修補題與 SAST/DAST 選擇題 |
| postgresql 24、38 | GRANT／policy 的 SQL 題、稽核 trigger、租戶隔離的 SQL 測試函式 |
| nestjs 20、22、23、27 | worker 冪等、上傳／webhook、OpenAPI 版本、Idempotency-Key |
| data-stores 12 | createUpload、confirmUpload、getReceiptUrl、lifecycle |
| devops 15～17、26 | workflow 填空、部署順序、藍綠、壓測 |
| system-design 10、22 | 限流演算法、下單路徑的設計題 |
| career 3 | README 骨架、作品卡、金鑰外洩選擇題 |

原則：同一個觀念可以再考，但情境要換成讀者自己的專案或 projects 示範模組；這門課的本機題一律是「黑箱驗收讀者的作品」，不出「在給好的程式裡填一個函式」。

## 參考實作的範圍（給寫 `portfolio-ref/` 的人）

- `small/`：第 1～5 課全部（含 Dockerfile、compose、workflow、README、自己的 spec 與 e2e 測試）。
- `saas/`：第 6～19 課最終版，業務模組只有 projects（＋files、exports）；有 `docs/adr/0001～0006`、README、Mermaid 圖、Dockerfile、compose、workflow。
- 兩份都要能被 `nestjs/practice` 的 node_modules 編譯（只用已安裝套件＋nodemailer），`package.json` 的 `services` 寫 `["postgres","redis","mailpit"]`（small 只寫 postgres）。
- local-verify 時間預估 ⏳：每個變體要 prisma generate＋tsc＋migrate＋nest build＋啟動，粗估 30～60 秒；一課 5～8 個變體約 5 分鐘。超過 10 分鐘就考慮讓 prepare 只在 `dist/` 不存在時 build，或把同一課的 wrong 變體減到每題 1～2 個最有代表性的。

---

## 寫課者 checklist（第 2～19 課）

地基已經建好（2026-11-19）：`portfolio/lab.js`、`index.html`、`CONTRACT-small.md`、`CONTRACT-saas.md`、第 1 課（範本：`lessons/01-requirements-to-schema.html`，task pf01），以及 `nestjs/practice/` 的共用檔與兩份參考實作。**參考實作已經是最終版**（small 涵蓋第 1～5 課、saas 涵蓋第 6～19 課），煙霧測試 31 項全過。寫課的人主要是寫**驗收測試＋wrong 變體＋課文**，不是再寫參考實作。

### 開工前

1. 讀完 AUTHORING.md、這份課綱、第 1 課、`portfolio/CONTRACT-*.md`、`nestjs/practice/helpers/portfolio.ts`、`portfolio-ref/saas/smoke/contract.smoke.ts`（每一課的契約在這裡都有一段可以照抄改寫的測試）。
2. 環境：`cd nestjs/practice && npm ci && docker compose up -d --wait`（postgres、redis、**mailpit** 三個都要 healthy）。
3. 先跑一次 `node nestjs/practice/portfolio-ref/saas/smoke/run.mjs`（約 30 秒），確認參考實作在你的機器上全過。

### 每一課要產出的檔案

| 檔案 | 內容 |
|---|---|
| `portfolio/lessons/NN-slug.html` | `<body data-lesson="N" data-practice="nestjs" data-task="pfNN">`；本機題 `<div class="local" data-test="exM" data-files="">`（`data-files` 空字串：頁面不列檔案、不顯示看答案）；結構照第 1 課：開場 → 這課會用到（≤4 項）→ 環境 callout → 路線 → 概念 → 練習（本機題＋3 題選擇題，編號從 1 連續）→ **自評清單**（`<h2>自評清單</h2>`，一般 `<ul>`）→ 常見錯誤 → 小結。階段最後一課（5、10、14、19）加階段檢核 |
| `nestjs/practice/start/pfNN/exM.test.ts` | 一題一個檔。最上層 `const t = await target(import.meta.dirname, 'saas')`（只讀 repo 的題目加 `{ http: false }`，不啟動也不連 API）。import 一律 `../../helpers/portfolio.ts`、`../../helpers/…` |
| `nestjs/practice/answer/pfNN/reference.json` | `{ "ref": "saas" }`（第 2～5 課是 `"small"`）。answer 只放這一個檔 |
| `nestjs/practice/wrong/pfNN/exM-說明/…` | 只放要蓋掉的檔案，路徑跟參考實作一樣（例如 `src/projects/projects.service.ts`）；prepare.mjs 會用 `force: false` 把參考實作的其他檔案補齊 |
| `nestjs/practice/portfolio-ref/…` | 只在發現參考實作的 bug 時改，而且只改「你負責的模組」（下表）；改完一定跑煙霧測試 |

**不要改**：`lab.js`（四個人同時改會衝突；寫完在回報裡列出檔名，由主對話一次填進 STAGES）、`index.html`、`courses.js`、`helpers/portfolio.ts`、`prepare.mjs`、`compose.yaml`、`package.json`、`local.js`、`check.mjs`、saas 的 `src/app.module.ts`、`prisma/schema.prisma`、`prisma/migrations/`、`smoke/`。需要改的話寫在回報裡。

### 參考實作的模組分工（平行寫課時誰可以碰哪些檔）

| 寫課的人 | 課 | 可以改的參考實作檔案 | 對應的煙霧測試段落 |
|---|---|---|---|
| 1 | 2～5 | `portfolio-ref/small/**` 全部 | （small 沒有煙霧測試；`node tests/local-verify.mjs portfolio pf01` 與 small 自己的 `npm test`） |
| 2 | 6～10 | saas 的 `src/auth/**`、`src/tenancy/**`、`src/members/**`、`src/prisma/**`、`src/projects/**`、`docs/adr/0001～0003` | 第 6～10 課 |
| 3 | 11～14 | saas 的 `src/audit/**`、`src/files/**`、`src/exports/**`、`src/billing/**`、`docs/adr/0004～0006` | 第 11～14 課 |
| 4 | 15～19 | saas 的 `src/common/**`、`src/health/**`、`src/tags/**`、`src/config/**`、`src/app.setup.ts`、`src/main.ts`、`Dockerfile`、`compose.yaml`、`.github/**`、`docs/architecture.md`、`README.md`、`test/**`、`vitest.config.ts` | 第 15～18 課 |

wrong 變體放在自己的 `wrong/pfNN/` 底下，蓋掉別人模組的檔案也沒關係（只影響自己那一題）。

### 驗證（交件前全部要過）

```bash
cd learn/tests
node local-verify.mjs portfolio pfNN     # 標準答案全過、起始檔每題都沒過、每個 wrong 只有自己那題沒過
node local-verify.mjs portfolio pf01     # 確認共用檔沒被動到
node ../nestjs/practice/portfolio-ref/saas/smoke/run.mjs   # 改過 saas 參考實作時（--keep 會留下 verify 資料夾方便除錯）
```

- 一個 saas 變體大約 15～25 秒（prisma generate、tsc、migrate、nest build、啟動）；一課 8 個變體約 3 分鐘。
- 失敗時看 wrong 的失敗訊息是不是**預期的那個測試**：tsc 沒過、啟動失敗，所有測試都會沒過，看起來像「被擋下」其實是壞在別處。除錯：`mkdir -p nestjs/practice/verify/dbg-1-x`，放 `reference.json`、測試檔與壞檔，在 `nestjs/practice` 執行 `node prepare.mjs verify/dbg-1-x && npx vitest run verify/dbg-1-x`，用完刪掉。

### 常見坑

1. **兩道防線會互相掩護**。參考實作同時有 Prisma extension（第 8 課）與 RLS（第 9 課），只拿掉其中一道，黑箱測試照樣過。所以：
   - 第 8 課的 wrong 變體（extension 漏條件、從 header 取租戶…）要**同時讓應用程式用擁有者連線**，模擬「第 8 課時還沒有 RLS」：變體裡放一份 `src/prisma/prisma.service.ts`，`connectionString` 改用 `process.env.DATABASE_URL`（判分時是 `learn` 帳號，superuser，不受 RLS 限制）。
   - 第 18 課 `ex1-business-unscoped`、第 13 課 `ex1-worker-no-tenant` 也一樣：漏條件的那段程式要用擁有者連線查，否則 RLS 讓它變成「查到 0 筆」而不是「洩漏」。第 13 課的題目本來就要求兩種結果都要被擋。
   - 第 9 課的灰箱測試用 `t.appDatabaseUrl` 連線，但**應用程式實際用哪個帳號不一定是它**。`ex1-owner-connection` 這樣判：先打一次 API（連線池會留著閒置連線），再用 appDatabaseUrl 查 `SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`，只能有 appDatabaseUrl 的那個角色。第 11 課 `ex4-mutable` 同理。
   - `ex3-session-set` 的變體寫法見上方「Prisma 7 寫課注意」第 5 點（要拿掉交易），判法是煙霧測試第 9 課的「200 個交錯請求」。
2. **參考實作是最終版，每一課的測試都對它跑**：測試一律 `signupTenant()` 自己開新租戶；免費方案只有 3 個 project、5 個成員（含邀請），一個租戶不要超過；每租戶每分鐘 300 個請求，一個測試對同一個租戶打的請求數要算清楚（`signupTenant` 本身會打 1 次 `/me`，`addMember` 會讓邀請人打 1 次）。
3. **併發測試用 `concurrent(20, total, fn)`**，不要 `Promise.all` 幾百個：macOS 會 ECONNRESET，連線池也會 `Unable to start a transaction`。
4. **Mailpit 是共用的**：信件只用 `email(role)` 產生的收件者找（含執行編號），`mailpitLink()` 會輪詢最多 10 秒。不要清空 Mailpit。
5. **repo 檢查**：出題檢查時 `t.repo` 是 verify 資料夾，`t.verify` 是 true，**不是獨立的 git repo**（在 learn repo 裡面）。要用 git 的檢查（`.env` 沒被追蹤、第 19 課掃 git 歷史）在 `t.verify` 時略過或改成檢查工作目錄，第 1 課 ex2 的寫法可以參考。`docker compose config --format json` 不需要 daemon 以外的東西，可以放心用；`docker build` 參考實作要另外處理：**參考實作沒有 package-lock.json**（它借 nestjs/practice 的 node_modules），Dockerfile 的 `npm ci` 在 verify 裡跑不起來。第 4、17 課要真的 build 的話，寫課的人決定怎麼補（例如 build 時把 nestjs/practice 的 lockfile 與 package.json 的 dependencies 一起放進 build context），或把那一題改成自評。
6. **第 3 課**：學習者的 `npm test` 在 small 參考實作上跑時，`vitest.config.ts` 會把資料庫換成 `nest_pf03_…_spec`，prepare.mjs 只清 `*_test`，`*_spec` 會留下來。第 3 課的測試跑完要自己 `DROP DATABASE … _spec`（只在 `t.verify` 時），或改 small 的 vitest.config。
7. **錯誤訊息要分得出原因**：`target()` 已經處理「沒填 portfolio.json」「repo 路徑不存在」「連不到 API」；測試本身的訊息寫「要什麼、實際是什麼、怎麼修」，`expectError(res, status, code, '說明')` 會印出實際的狀態碼與 body 前 200 字。
8. **不測跟時間有關的行為**（token 15 分鐘過期、邀請 72 小時）：放自評清單與選擇題。
9. **參考實作的寫法就是範本**：課文的程式碼片段直接從參考實作摘，檔名與路徑一致；參考實作裡沒有的寫法，課文要寫清楚是「另一種做法」。saas 的模組地圖與依賴方向在 `portfolio-ref/saas/docs/architecture.md`。
10. **共用檔已知的小缺口**：`check.mjs` 第一次執行時仍會印「打開裡面的檔案開始寫」（課綱列為選用、這次沒改）；sheets（各階段一頁圖解）還沒做，寫到階段最後一課的人在回報裡提，由主對話統一 render。

### 參考實作的地圖（找程式用）

| 課 | saas 檔案 |
|---|---|
| 6 | `src/common/error.filter.ts`、`request-id.middleware.ts`、`docs/adr/`、`docs/architecture.md` |
| 7 | `src/auth/*`（signup、login、refresh 輪替與 `REFRESH_REUSED`、登入限流 `login-throttle.service.ts`） |
| 8 | `src/common/request-context.ts`（ALS）、`src/tenancy/access.guard.ts`、`src/prisma/tenant-db.ts` 的 `scoped()`、`src/projects/*`、schema 的 `@@unique([tenantId, id])` 與 files 的複合外鍵 |
| 9 | `src/prisma/tenant-db.ts` 的 `client`／`tx()`、migration 最後的「手寫」段落（`pf_app`、ENABLE＋FORCE、policy）、`auth.service.ts` 的 signup（明確的上下文）、token 格式 `tenantId.隨機值`／`userId.隨機值` |
| 10 | `src/members/*`、`src/tenancy/permissions.ts`、`access.guard.ts`（每個請求查 membership、沒宣告就 403） |
| 11 | `src/audit/*`（只收 `tx`）、migration 的 `REVOKE UPDATE, DELETE ON audit_logs` |
| 12 | `src/files/*`（`defParamCharset: 'utf8'`、magic bytes、`filename*`） |
| 13 | `src/exports/*`（`ctx.run` 重建租戶上下文、jobId、CSV 跳脫） |
| 14 | `src/billing/*`（`lockTenant` 的 `FOR UPDATE`、Redis 的 `ThrottlerStorage`、tracker 用 tenantId） |
| 15 | `src/app.setup.ts`（`/openapi.json`）、`src/common/openapi.ts`（`ErrorResponse`、`@ApiErrors`）、nest-cli.json 的 swagger plugin |
| 16 | `src/common/app.logger.ts`、`request-id.middleware.ts`、`src/health/health.module.ts`、`error.filter.ts` 的 500 |
| 17 | `Dockerfile`、`compose.yaml`、`.github/workflows/ci.yml` |
| 18 | `src/app.setup.ts`（helmet、CORS 白名單、1 MB body）、`src/tags/tags.module.ts`、`test/tenant-isolation.e2e-spec.ts` |
| 19 | `README.md`、`docs/` |
