# Supabase 課綱（精簡版）

課名：**Supabase：用 Postgres 當後端**
資料夾：`learn/supabase/`；CLI 專案在 `supabase/practice/supabase/`（兩層 supabase：外層是課程資料夾，內層是 CLI 的專案資料夾）。
9 課、4 個階段，選修。標 ⏳ 的是寫那一課的人要自己再實測的項目。課號、課名、檔名以 `supabase/lab.js` 的 STAGES 為準。

## 2026-11-19 精簡：16 課縮成 9 課，改成選修

**理由**：原本的 16 課跟既有的課重疊很多，對「轉職全端／後端工程師」的投入報酬中低。RLS 的基礎在 PostgreSQL 課第 24 課、OAuth／PKCE／MFA 在 auth 課第 12～14 課、trigger／排程／佇列在 PostgreSQL 課第 23、33 課與 nestjs 課第 21 課、付款 webhook 在 delivery 課第 8 課與 nestjs 課第 22 課都教過。這門課只留它獨有的兩件事：

1. **「PostgREST＋RLS 當後端」的設計方式**：前端直接打自動產生的 API，權限全部寫在資料庫（GRANT＋RLS），伺服器端邏輯放 RPC 或 Edge Function。
2. **何時該用 BaaS 的判斷**：哪些需求 Supabase 做得好、哪些要搭配自己的後端、什麼時候搬離。

別門課教過的內容不重教，用一句回顧＋連結帶過。上面「全課共用」的版本、平台現況、練習環境、隔離規則都是實測過的資料，照舊適用。

舊課號對照（寫課的人看舊討論時用）：

| 舊 | 新 | 處理 |
|---|---|---|
| 1、2、3 | 1、2、3 | 不變 |
| 4 | 4 | 縮成 Supabase 特有的部分；RLS 語法本身回顧 PostgreSQL 課第 24 課 |
| 5＋6 | 5 | 6 的 `(select auth.uid())`＋索引併進第 4 課，漏洞清單與 RLS 測試寫法併進第 5 課與期末；EXPLAIN 練習刪掉（PostgreSQL 課第 21、29 課） |
| 7＋8＋9 | 6 | 合併成一課 Auth；OAuth、PKCE、MFA、refresh token 輪替只回顧 auth 課；profiles trigger 留下；custom access token hook 只講一段 |
| 10 | 7 | 不變 |
| 11 | — | 刪掉。Realtime 在第 1 課介紹過它是什麼；推播的規模取捨在 system-design 課第 17 課 |
| 12＋13 | 8 | 合併成「伺服器端邏輯放哪裡」：RPC 與 Edge Functions；trigger、pg_cron、pgmq、webhook 簽章只回顧 |
| 14＋15＋16 | 9 | 期末專題：migration、修權限漏洞、寫「要不要留在 Supabase」的決策紀錄；連線池、備份、費用變成決策紀錄的材料 |

---

## 全課共用

### 版本（2026-11-15 在這台 Mac 實測）

| 東西 | 版本 | 出處／怎麼確認 |
|---|---|---|
| Supabase CLI | **3.1.0**，鎖在 `practice/package.json` 的 devDependencies；課文與測試一律 `npx supabase …`／`node_modules/.bin/supabase` | npm dist-tags：latest 3.1.0（2026-11-09）、v2.stable 2.122.1；changelog「Supabase CLI v3」（v3.0.0 於 2026-11-02 發布） |
| @supabase/supabase-js | 2.119.0（engines node ≥ 22） | npm latest（2026-11-04） |
| pg | 8.23.1（＋@types/pg 8.23.1） | 跟 nestjs/practice 一致 |
| @types/node | 24.19.2 | 跟其他課一致 |
| Node | engines `>=24.12.0`；這台是 24.22.1 | node --test 直接跑 .ts |
| Postgres | `public.ecr.aws/supabase/postgres:17.11.0.018`（PostgreSQL 17.11） | `docker ps`、`select version()` |
| Gateway | `public.ecr.aws/supabase/kong:2.8.1` | docker ps（自架版 2026-07 起預設改 Envoy，CLI 本機仍是 Kong） |
| PostgREST | `postgrest:v16.5` | docker ps |
| Auth（GoTrue） | `ghcr.io/supabase/gotrue:v2.197.0` | docker ps |
| Realtime | `realtime:v2.154.0` | docker ps |
| Storage | `storage-api:v1.90.1` | docker ps |
| Edge Runtime | `edge-runtime:v1.78.1`（Deno 2，`[edge_runtime] deno_version = 2`） | docker ps、config.toml |
| Studio | `studio:2026.11.09-sha-1567384`；postgres-meta v0.100.0 | docker ps |
| Mailpit | `mailpit:v1.31.3`（容器名稱仍叫 `supabase_inbucket_learn-supabase`） | docker ps |
| 之後的課才加的套件 | @supabase/ssr 0.12.7（第 6 課加進 package.json 時再確認是否仍是 latest） | npm |

**為什麼用 CLI v3、不用機器上的 2.121.0**：v3 從 2026-11-02 起是 npm／brew 的預設；「預設只動本機，改雲端要 `--remote`，而且預設回答 No」對學習者比較安全。課文要提醒：2025 年以前的教學常見的 `--linked`、`--project-ref`、`--db-url`（v3 改成 `--remote`，舊旗標已棄用）、`config.toml` 的 `[inbucket]`（改名 `[local_smtp]`，舊名讓 start 直接失敗）。讀者的全域 CLI 不用升級也不用移除；課程只用 practice 裡的那一份。

### 平台現況（課文一定照這個寫；已實測的標 ✓）

1. ✓ **新表不會自動開放給 Data API**（changelog 2026-04-28 breaking change；新專案 2026-05-30、所有專案 2026-10-30 起）。本機用 `[api] auto_expose_new_tables = false` 對齊雲端（CLI 不設時是 true）。實測：postgres 在 public 建的新表，anon／authenticated／service_role 只拿到 `TRUNCATE, REFERENCES, TRIGGER`，沒有 SELECT/INSERT/UPDATE/DELETE（跟 docs guides/api/securing-your-api「Default privileges」一致）。
2. ✓ **兩道門的錯誤長相**：沒有 GRANT → HTTP 401/403 + JSON `{"code":"42501","message":"permission denied for table orders","hint":"Grant the required privileges … GRANT SELECT ON public.orders TO anon;"}`；有 GRANT、RLS 沒有符合的 policy → `[]`。
3. ✓ **API key**：本機 `supabase status` 印出 `sb_publishable_…` 與 `sb_secret_…`（每台機器都一樣的固定示範值，**不是秘密，但測試一律即時讀 `supabase status -o json`，不寫死**），也還有舊的 `ANON_KEY`／`SERVICE_ROLE_KEY`（HS256 JWT）。publishable → anon（帶使用者 JWT → authenticated）；secret → service_role（BYPASSRLS）。舊 anon／service_role key 2026 年底淘汰（docs getting-started/api-keys）。
4. ✓ **本機跟雲端不同的地方（課文要標出來）**：
   - 本機 gateway **不帶 apikey 也會放行**（`curl /rest/v1/products` 沒有任何 header 也回 200，以 anon 身分）；雲端會回 401。所以「要帶 apikey」只能用測試裡的 proxy 檢查 header，不能靠伺服器回應判。
   - 本機 secret key 用瀏覽器 User-Agent 呼叫**不會**被擋（實測 200）；雲端依 User-Agent 回 401（docs getting-started/api-keys）。
   - 本機簽章金鑰：PostgREST 的 `PGRST_JWT_SECRET` 是 JWKS，含一把 **ES256（EC P-256）** 公鑰與一把舊的 HS256 對稱金鑰，所以本機發的使用者 JWT 是非對稱簽章，`getClaims()` 可以本地驗章 ⏳ 第 6 課實測 `/auth/v1/.well-known/jwks.json`。
5. ✓ `auth.uid()` 的定義（本機 17.11.0.018 實際查到）：`coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid`。所以 SQL 裡模擬使用者：`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true);`。
6. ✓ 角色設定：`anon` statement_timeout 3s、`authenticated` 8s、`authenticator` 載入 `supautils, safeupdate`（safeupdate：API 來的 UPDATE／DELETE 沒有 WHERE 會被拒絕 ⏳ 第 2 課實測錯誤訊息）。
7. 其他：`auth.role()` 已不建議用，改 `TO authenticated`；`user_metadata` 使用者自己改得到，授權只用 `app_metadata`；UPDATE 要有 SELECT policy 否則默默 0 列；view 預設繞過 RLS，要 `with (security_invoker = true)`；OpenAPI spec 不再對 anon key 開放（changelog 2026-02-17）；pg_graphql 新專案不自動啟用（2026-01-26）。

### 練習環境

- 一套共用的本機 Supabase。`config.toml`：`project_id = "learn-supabase"`（容器名稱 `supabase_<服務>_learn-supabase`，前綴是 CLI 決定的，改不了）。
- Port 全部改到 554xx，避開讀者其他 Supabase 專案的預設 543xx（這台 Mac 上就有一個停著的 `supabase-todo-lab` 用 543xx）與已被佔用的 5000、8000：

  | 用途 | port |
  |---|---|
  | API gateway（Project URL） | 55421 |
  | Postgres | 55422 |
  | shadow DB（db diff 用） | 55420 |
  | Studio | 55423 |
  | Mailpit 網頁 | 55424 |
  | analytics（排除，不會開） | 55427 |
  | pooler（停用，不會開） | 55429 |
  | Edge Functions inspector | 55483 |

- `[auth] site_url = "http://localhost:5173"`、`additional_redirect_urls = ["http://localhost:5173/**"]`（Vite 預設 port）。
- 指令（在 learn/ 執行；npm scripts 都帶 `--workdir .`）：
  - 啟動：`npm --prefix supabase/practice run up`（= `supabase start --workdir . -x imgproxy,logflare,vector,supavisor`）
  - 狀態：`npm --prefix supabase/practice run status`
  - 停止（保留資料）：`npm --prefix supabase/practice run down`
  - 完全重來（刪 volume）：`npx --prefix supabase/practice supabase stop --workdir supabase/practice --no-backup`，再 up。只有讀者自己用；**判分與課文練習步驟都不准用 `db reset`／`--no-backup`**。
- **為什麼一定帶 `--workdir`**：CLI 不帶時往上層找 `supabase/` 資料夾；在 learn/ 執行會先撞到課程資料夾 `learn/supabase/`。
- 第一次 up：這台 Mac 實測 282 秒（大部分在下載映像，約 5 GB 磁碟）；down 之後再 up 實測約 36 秒（資料保留）。有一次 down 後 up 回 exit 1（輸出沒留下），立刻重跑成功，之後連續 3 次都正常：課文已寫「失敗就再執行一次」⏳ 若有人重現請記下訊息。
- CLI 啟動時會印「All services bind to 0.0.0.0」：本機 port 對同一個網路的其他電腦開放，key 與密碼都是公開的預設值。第 3 課提一句：不要在咖啡廳的公用網路長時間開著，或用防火牆擋。
- 共用的咖啡店資料：`supabase/migrations/20261114191058_cafe_baseline.sql`（建 public 的 customers／products／orders／order_items、全部開 RLS、products 給 anon/authenticated 讀）＋ `supabase/seed.sql`（資料）。第一次 up 時自動套用。

### 服務、記憶體與課程對照（實測 `docker stats`，閒置）

| 服務（`-x` 名稱） | 容器 | 記憶體 | 哪幾課需要 |
|---|---|---|---|
| postgres（不能排除） | supabase_db_… | 127 MiB | 全部 |
| kong | supabase_kong_… | 106 MiB | 所有走 HTTP API 的題（1 起） |
| postgrest | supabase_rest_… | 6 MiB | 1–9 |
| gotrue | supabase_auth_… | 13 MiB | 3 起 |
| realtime | supabase_realtime_… | 215 MiB | 精簡後沒有一課用到；記憶體不夠可以排除 |
| storage-api | supabase_storage_… | 153 MiB | 7、9 |
| edge-runtime | supabase_edge_runtime_… | 119 MiB | 8、9 |
| mailpit | supabase_inbucket_… | 27 MiB | 6 |
| studio | supabase_studio_… | 332 MiB | 1（導覽）；之後選用 |
| postgres-meta | supabase_pg_meta_… | 216 MiB | Studio 需要；第 2 課 `gen types` ⏳ 確認是否用它 |
| imgproxy、logflare、vector、supavisor | — | — | 一律排除（圖片轉換是雲端付費功能；log 與連線池第 9 課用文字與設定說明） |

- 預設 up（排除 4 個）全部 10 個容器閒置合計約 **1.3 GB**；Docker 只有 8 GB、已被 kind 叢集等吃掉約 2.1 GB 時仍跑得動。
- 記憶體不夠時讀者可以再排除：`-x imgproxy,logflare,vector,supavisor,studio,postgres-meta`（省約 550 MB）；只做第 1–6 課可以再排 `realtime,storage-api,edge-runtime`（核心 db＋kong＋rest＋auth 約 250 MB）。每課開頭的「環境」callout 寫這課需要哪些服務。
- 課程統一用一份 up 指令，不要每課換排除清單（測試的 requireStack 檢查該課需要的服務，缺了就提示完整的 up 指令）。

### 平行判分的隔離（重點，已實測可行）

- **public 的四張咖啡店表是唯讀共用資料**：測試只能讀，不能寫、不能改 policy。
- **要建表、寫 policy、寫資料的題**：每次判分有一個專屬 schema `t_<slug>`：
  - slug 由題目資料夾算出：`work/04` → `w04`；`verify/04-12345-answer` → `v04_12345_answer`（只留 `[a-z0-9_]`）。
  - helper 先 `drop schema if exists … cascade` 再建，`grant usage on schema t_<slug> to anon, authenticated, service_role`，把學習者的 SQL 用 `set search_path = t_<slug>, public, extensions` 套進去。
  - 讓 PostgREST 看得到：`alter role authenticator set pgrst.db_schemas = 'public,graphql_public,<所有 t_ schema>'` → `notify pgrst, 'reload config'` → `notify pgrst, 'reload schema'`（**實測可行**：in-database 設定會覆蓋容器的 PGRST_DB_SCHEMAS）。清單一律從 `pg_namespace` 重新算（`nspname like 't\_%'`），外面包 `pg_advisory_xact_lock`，多人同時跑不會互相蓋掉。
  - supabase-js 用 `createClient(url, key, { db: { schema: 't_<slug>' } })`（送 `Accept-Profile`／`Content-Profile` header）；helper 已經包好，學習者的函式收到的 client 已經指向自己的 schema。
  - 學習者寫的 SQL **不寫 `public.` 前綴**（題目說明這是判分需要；課文範例可以寫）。
- 使用者：email 一律 `<slug>-<名字>@learn.test`，用 secret key 的 admin API 建立、跑完刪除。
- Storage bucket、Realtime channel、Edge Function 名稱都加 `<slug>` 前綴。
- `prepare.mjs`：檢查 stack；刪掉資料夾已經不在的 `t_*` schema、`@learn.test` 使用者、bucket；重算 pgrst.db_schemas。

### 判分與練習的寫法

- 測試：`node:test` + `node:assert/strict`（沒有 vitest.config）；檔名 `exN.test.ts`；import `../../helpers/supa.ts`。
- `helpers/supa.ts` 提供：`stack()`（讀 `supabase status -o json`，快取）、`requireStack(services?)`（缺什麼就丟出怎麼修的中文訊息）、`recordingProxy()`（listen 0 的 HTTP proxy，記錄每個請求的 method、path、query、header，轉送到 API）。第 2 課起由寫該課的人加：`taskSchema(dir)`、`sql(text)`（pg 直連 55422，postgres 身分）、`createUser`、`clientFor(user)`；加的時候照上面的隔離規則。
- `taskSchema`、`applySql`、`dropTaskSchema`、`syncSchemas`、`sql` 已經寫好並有自我檢查：`node supabase/practice/bin/selfcheck.ts`（改 helper 後跑）。applySql 會等 PostgREST 的 schema cache 真的載入每張表（不用 OpenAPI 判斷：沒 GRANT 的表不會出現在 OpenAPI）。
- **坑（已修）**：`pgrst.db_schemas` 清單的第一個是預設 schema，一定要 `public` 在第一個，否則沒帶 Accept-Profile 的請求全部 404 PGRST205。
- 本機 gateway 連「錯的 apikey」都放行（實測 `apikey: sb_publishable_wrong` 回 200），所以題目不能用「伺服器回 401」判斷 key 對不對；要判就用 recordingProxy 看 header。要測「API 回錯誤時程式會丟錯」，在測試裡開一個回 503 的 node:http 伺服器（第 1 課練習 3 的寫法）。
- local-verify 實測：第 1 課 2 題本機、8 個測試，約 42 秒（含 7 個 wrong 變體）。
- 瀏覽器 TS 題用在純邏輯：路徑分派、JWT 的 role 解讀、key 分類、連線數與費用估算。PKCE、TOTP、HMAC 驗章 auth 課與 nestjs 課已經練過，不再出。

### PostgreSQL 課的 PGlite 引擎能不能拿來做 RLS 題（評估結論：不用）

- 技術上可以做「SQL 層」的 RLS：PGlite 支援 `CREATE ROLE`、`SET ROLE`、`set_config`，seed 裡自己建 `anon`、`authenticated` 與一個仿 `auth.uid()` 的函式。
- 不用的理由：
  1. 行為不會跟 Supabase 一致的地方剛好是這門課的重點：GRANT 的預設值（新表不開放）、PostgREST 回的 42501 與空陣列、UPDATE 沒 SELECT policy 時的 0 列、safeupdate、`auth.jwt()` 裡的 app_metadata 與 aal、Storage／Realtime 的 policy（`storage.objects`、`realtime.messages`）、真的 JWT 經 gateway 變成角色。仿出來的 `auth` schema 讓讀者以為自己懂了，到真的 Supabase 又不一樣。
  2. 要給別的課用得改共用檔：`postgresql/lab.js` 第 402 行 `if (globalThis.document?.body.dataset.lesson) init()` 會用 PostgreSQL 課的 `LESSONS`／`KEY` 自動初始化；`tests/pg-verify.mjs` 也只認 postgresql/。要拆成「引擎」與「課程清單」兩個檔才能共用。依指示不改。
  3. 讀者本來就要啟動本機 Supabase（第 1 課起），多一套瀏覽器引擎只省下啟動時間，卻多一個要維護的差異。
- 建議：SQL／RLS 一律在本機真 Supabase；純邏輯題用瀏覽器 TS。若之後想讓第 4 課的入門範例「頁面上直接按執行」，再考慮拆 postgresql/lab.js（要你決定）。

### 寫課的人最容易踩的坑

- 課文給讀者的網址寫 `http://localhost:55421`、Studio `http://localhost:55423`；`supabase status` 自己印的是 127.0.0.1，兩個都能用。
- 本機不帶 apikey 也能打（見上），不要寫「沒帶 apikey 會 401」而不說明是雲端行為。
- 測試不要假設 public 表可寫；不要 `db reset`；不要動 `authenticator` 以外的角色設定。
- `supabase status` 在 Claude Code 等 agent 環境會自動輸出 JSON（`--agent auto`）；給讀者看的輸出用 `--agent no` 取得的表格。
- 每課都要說明它需要哪些服務、記憶體不夠時排除哪些。
- 讀者不一定讀過 PostgreSQL 課，但精簡版**不重教**別門課已經教過的東西（清單見「不重教、不能重複」）：用到的地方寫一兩句回顧（它是什麼、在這裡為什麼要用），再連到原課。

---


## 不重教、不能重複

下面這些別門課已經教過，課文只寫一句回顧＋連結，練習題不能跟它們重複（同一個觀念換成 Supabase 特有的情境才可以出）：

| 主題 | 出處 | 這門課怎麼處理 |
|---|---|---|
| role、GRANT、RLS 的語法與「誰會繞過 RLS」 | PostgreSQL 課第 24 課 | 第 3、4 課回顧；只講 Supabase 的角色對應、`auth.uid()`、PostgREST 回的結果 |
| view、function、trigger 的語法 | PostgreSQL 課第 23 課 | 第 5、8 課回顧；只講 `security_invoker`、函式透過 `rpc()` 公開時的權限 |
| 索引、EXPLAIN | PostgreSQL 課第 20、21、29 課 | 第 4 課只講 policy 欄位要有索引與 `(select auth.uid())`，不出 EXPLAIN 題 |
| migration 的觀念、零停機 | PostgreSQL 課第 22、34 課；devops 課第 17 課 | 第 9 課只講 Supabase CLI 的流程 |
| 工作佇列、排程 | PostgreSQL 課第 33 課；nestjs 課第 20、21 課 | 第 8 課一段文字帶過 pg_cron、pgmq |
| JWT 結構與驗章、access／refresh token 輪替、登出與撤銷 | auth 課第 8～11 課 | 第 3、6 課回顧 |
| OAuth、PKCE、OpenID Connect | auth 課第 12、13 課 | 第 6 課只講 Supabase 的設定（redirect 白名單、`flowType: 'pkce'`、`exchangeCodeForSession`），不出 PKCE 計算題 |
| MFA／TOTP | auth 課第 14 課 | 第 6 課一段：`aal` claim 與 restrictive policy，不出 TOTP 題 |
| RBAC、BOLA、多租戶隔離 | auth 課第 18～20 課 | 第 4、5 課回顧觀念，練習只做 RLS 的寫法 |
| webhook 簽章、冪等、付款狀態 | auth 課第 17 課；nestjs 課第 22 課；delivery 課第 8 課 | 第 8 課一句回顧，不出 HMAC 驗章題 |
| ADR | system-design 課第 18 課 | 第 9 課的決策紀錄照它的格式 |

## 階段 1：起步：一個 Postgres 加上一組服務

### 第 1 課（已完成，範本）　Supabase 是什麼：一個 Postgres 加上一組服務｜`01-what-is-supabase.html`
- 內容見檔案。2026-11-19 只改了提到後續課號的地方（服務對照表、記憶體表、選擇題解說）。
- 重點：Supabase＝一個完整的 Postgres＋一組服務（gateway、PostgREST、Auth、Realtime、Storage、Edge Functions、Studio）；權限在資料庫裡；本機用 CLI 3.1.0 啟動；同一份資料三個入口；什麼時候該用 BaaS；與 Firebase 對照。
- 練習：1 本機 `stack.json`；2 瀏覽器 TS `serviceFor(path)`；3 本機 `fetchMenu`；4～6 選擇題。

### 第 2 課　表與自動產生的 API：supabase-js 的查詢、關聯與型別｜`02-data-api.html`
- 情境：菜單頁、訂單明細頁、新增訂單；前端寫了 7 個 API 呼叫，有 N+1、有把整張表抓回來在前端 filter。
- 重點：
  1. PostgREST 怎麼從表產生 API：每張表一個端點，`select`、篩選（`eq`、`gt`、`in`、`ilike`、`is`）、`order`、`range`（分頁）、`limit`。supabase-js 的寫法與它產生的 HTTP 對照。
  2. 關聯嵌入：`select('id, total, order_items(quantity, products(name))')` 靠外鍵自動 JOIN；一次請求解決 N+1。`!inner` 讓嵌入表的篩選影響父表。外鍵與 JOIN 回顧 PostgreSQL 課第 8、9 課。
  3. 新增修改刪除：`insert`／`update`／`upsert`／`delete` 預設不回傳資料，要 `.select()`；`update`／`delete` 一定要有篩選（safeupdate ⏳ 實測錯誤訊息）；`.single()`／`.maybeSingle()`。
  4. 錯誤處理：supabase-js 不丟例外，回 `{ data, error }`；`error.code` 是 Postgres SQLSTATE 或 PGRST 碼。
  5. 計數與上限：`count: 'exact'`、`max_rows = 1000`（config.toml）。
  6. 產生 TypeScript 型別：`npx supabase gen types typescript --local`（v3 預設本機）→ `Database` 型別傳給 `createClient<Database>()`。
  7. 什麼時候 API 不夠用：多表要在同一個交易裡寫入 → RPC（第 8 課）。
- 💡 實務上：分頁用 range＋穩定排序；列表頁只 select 需要的欄位；型別檔放進 CI 檢查是否過期。
- 練習（本機，表在 public 唯讀，或 t_<slug>）：
  1. `getOrderDetail(client, id)`：一次請求取回訂單＋品項＋商品名。mustFail：每個品項各查一次（proxy 計數 >1）；沒用 single 回傳陣列。
  2. `searchMenu(client, { maxPrice, keyword, page })`：篩選＋排序＋分頁。mustFail：前端 filter；分頁沒排序。
  3. `placeOrder(client, …)` 在 t_<slug> 新增訂單與品項並回傳新 id。mustFail：沒 `.select()` 拿不到 id；忽略 error。
  4. 瀏覽器 TS：用給定的 `Database` 型別寫出型別正確的 row 轉換（`Tables<'orders'>`）。mustFail：用 any。
- 選擇題：嵌入怎麼知道關聯（外鍵）；`update` 沒加篩選會怎樣；`{ data, error }` 不 throw。
- 用到：第 1 課；PostgreSQL 課第 4、5、8、9 課（回顧）。

### 第 3 課　API key、角色與 GRANT：誰能碰到哪張表｜`03-keys-roles-grants.html`
- 情境：工程師把 secret key 放進 Vite 的 `VITE_` 變數；另一個人建了新表卻從前端讀不到（42501），於是把 RLS 關掉。
- 重點：
  1. 兩種 key：publishable（公開，→ anon；使用者登入後帶自己的 JWT → authenticated）、secret（→ service_role，BYPASSRLS，只能放伺服器；雲端依瀏覽器 User-Agent 擋）。舊 anon／service_role JWT key 2026 年底淘汰。
  2. 為什麼前端的 key 本來就是公開的：它只代表「哪個 app」，不代表「哪個人」；安全只能靠 GRANT＋RLS。
  3. 請求怎麼變成 Postgres 角色：gateway 驗 apikey → PostgREST 驗 Authorization 的 JWT → `SET LOCAL ROLE <role claim>`、`request.jwt.claims` 設成整包 claims → `auth.uid()` 讀 `sub`。JWT 結構回顧 auth 課第 8 課。
  4. 角色：`anon`、`authenticated`、`service_role`、`authenticator`（PostgREST 連線用、只能切換角色）、`postgres`。role 與 GRANT 的語法回顧 PostgreSQL 課第 24 課。
  5. 兩道門：GRANT（表層級，沒有 → 42501）→ RLS（列層級，沒有 policy → 空結果）。2026 新預設：新表不自動 GRANT（本機 `auto_expose_new_tables = false`）。
  6. 正確流程：建表 → enable RLS → policy → GRANT 給需要的角色、需要的動作（不要 `grant all`）。
  7. 什麼時候用 secret key：伺服器端的管理工作；不要用它「解決權限錯誤」。
- 💡 實務上：key 外洩時怎麼輪替；`.env` 與 `VITE_` 前綴；advisor 會抓「public 表沒開 RLS」；本機 port 綁 0.0.0.0，不要在公用網路長時間開著。
- 練習：
  1. 本機 SQL（t_<slug>）：讓 anon 只能讀菜單、authenticated 能新增訂單：GRANT＋RLS＋policy。測試用 publishable／使用者 JWT 打 API。mustFail：`grant all`；只 GRANT 沒開 RLS；開了 RLS 沒 policy。
  2. 瀏覽器 TS：`requestRole(headers)` 依 apikey 與 Authorization 推出這個請求在資料庫裡是哪個角色、`auth.uid()` 是什麼（JWT 只解 payload、不驗章，`now` 由參數傳入，過期回錯誤）。mustFail：base64 而非 base64url；沒檢查 exp；有 secret key 時仍依 JWT 的 role。（auth 課第 9 課是完整驗 JWT，這題重點是 Supabase 的角色對應）
  3. 瀏覽器 TS：`classifyKey(value)` 判斷字串是 publishable／secret／legacy JWT（anon 或 service_role）／未知，並回傳能不能放前端。mustFail：所有 `eyJ` 都當 anon。
- 選擇題：42501 vs 空陣列各代表哪道門；publishable key 被看到是否要輪替；service_role 為什麼不受 RLS 管。
- 用到：第 1、2 課；auth 課第 8 課、第 17 課（API key）；PostgreSQL 課第 24 課。

## 階段 2：權限：Row Level Security

### 第 4 課　RLS 實戰：auth.uid()、USING 與 WITH CHECK，以及 API 看到的結果｜`04-rls-basics.html`
- 情境：顧客 A 改了 URL 的 id，看到顧客 B 的訂單（IDOR）。
- 不重教：`enable row level security`、`create policy … using … with check` 的語法、多個 permissive policy 是 OR、表擁有者與 BYPASSRLS 不受 RLS 管，這些 PostgreSQL 課第 24 課教過，課文用一段回顧（含一個最小範例）＋連結。
- 重點：
  1. `auth.uid()` 讀 JWT 的 sub（第 3 課）；未登入是 NULL，`NULL = user_id` 不是 true → 看不到。
  2. 從 API 看 RLS：沒有符合的 policy 時 select 回 `[]`、不是錯誤；USING 決定哪些既有列看得到／能被改刪，WITH CHECK 決定寫入後的新列；INSERT 只有 WITH CHECK；UPDATE 兩個都要（不然能把 user_id 改成別人）。
  3. UPDATE 要先「看得到」：沒有 SELECT policy 時 update 默默 0 列（PostgREST 回 204／空）。
  4. `TO authenticated` 只是「有登入」，沒有擁有者條件就是 BOLA（回顧 auth 課第 19 課）；用 `TO authenticated` 取代 `auth.role()`。
  5. 在 SQL 裡模擬請求：`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true);`（交易內）。
  6. 效能：policy 等於加在每一列的 WHERE；`(select auth.uid())` 包一層讓 Postgres 只算一次（docs row-level-security-performance）、policy 用到的欄位要有索引、查詢裡也加 `.eq('customer_id', uid)`。只講結論，EXPLAIN 回顧 PostgreSQL 課第 21 課。
- 💡 實務上：每張 public 表的 checklist；新功能 PR 審 policy 的看法。
- 練習（本機 SQL，t_<slug>，測試用兩個真使用者的 JWT 透過 API 打）：
  1. orders 擁有者可讀。mustFail：`using (true)`；只寫 `to authenticated`。
  2. 擁有者可新增，且不能替別人下單。mustFail：INSERT 只寫 USING（語法錯）／沒 WITH CHECK 條件。
  3. 擁有者可改備註但不能把訂單轉給別人。mustFail：UPDATE 沒 WITH CHECK；沒 SELECT policy 導致更新 0 列。
- 選擇題：沒 policy 時 API 回什麼；WITH CHECK 擋的是什麼；`(select auth.uid())` 為什麼比較快。
- 用到：第 3 課；PostgreSQL 課第 24 課。

### 第 5 課　RLS 常見模式：多租戶、角色、security definer、view 與漏洞清單｜`05-rls-patterns.html`
- 情境：咖啡店開了三家分店，店員只能看自己分店的單；店長看全部；有人寫了一個 view 給報表，結果顧客能從 API 看到全部訂單。
- 重點：
  1. 團隊／多租戶：`store_members(store_id, user_id, role)`，policy 用 `store_id in (select store_id from store_members where user_id = (select auth.uid()))`。多租戶的觀念回顧 auth 課第 20 課。
  2. policy 裡查另一張有 RLS 的表會再套 RLS（可能遞迴，42P17）→ 包成 `security definer` 函式，放在不公開的 schema（`private`），`set search_path = ''`，並 `revoke execute … from public`。
  3. 角色放 `app_metadata`（只有伺服器能改），用 `auth.jwt() -> 'app_metadata' ->> 'role'`；絕不用 `user_metadata`。JWT 內容要等 refresh 才更新。
  4. view：預設以建立者身分執行、繞過 RLS → `with (security_invoker = true)`。view 語法回顧 PostgreSQL 課第 23 課。
  5. restrictive policy 疊加限制（例：`(auth.jwt() ->> 'aal') = 'aal2'` 才能改店家設定；MFA 本身回顧 auth 課第 14 課）。
  6. 漏洞清單（期末會用）：沒開 RLS、`using (true)`、少了 WITH CHECK、用 user_metadata、security definer 放 public、view 沒 security_invoker、storage policy 漏寫、secret key 外洩。`supabase db advisors` ⏳ 確認 v3 指令名。
  7. 怎麼測 RLS：在交易裡切角色＋claims，每張表測「自己看得到／別人看不到／不能改成別人的」；pgTAP（`supabase test db`）一段帶過。
- 💡 實務上：多租戶每張表都放 store_id；角色資料只有一個來源；上線前用漏洞清單審一次。
- 練習（本機 SQL）：
  1. 分店店員只看自己分店。mustFail：policy 查 store_members 造成無限遞迴；用 user_metadata 判斷。
  2. 店長角色用 app_metadata。mustFail：用 user_metadata（測試會用使用者自己的 updateUser 改 metadata 嘗試越權）。
  3. 報表 view 加 security_invoker。mustFail：沒加（anon 看得到全部）；把 view 放 public 又 grant 給 anon。
  4. security definer 函式在 private schema 且 search_path 鎖死。mustFail：放 public（anon 可直接 RPC 呼叫）；沒 set search_path。
- 選擇題：user_metadata vs app_metadata；view 為什麼繞過 RLS；security definer 的風險。
- 用到：第 4 課；auth 課第 18、20 課；PostgreSQL 課第 23 課。
- 階段檢核（5～8 題，涵蓋第 3～5 課）。

## 階段 3：Auth 與檔案

### 第 6 課　Auth：登入、session、伺服器端驗證與 profiles｜`06-auth-sessions.html`
- 情境：顧客登入後過一小時突然 401；Nuxt／伺服器端的 handler 用 `getSession()` 拿到的 user 做授權，被偽造的 cookie 騙過；新註冊的使用者在 profiles 表找不到。
- 不重教：access／refresh token 的分工與輪替（auth 課第 10 課）、登出與撤銷的取捨（第 11 課）、OAuth 授權碼流程與 PKCE（第 12、13 課）、TOTP（第 14 課）。課文各一句回顧＋連結，只講 Supabase 怎麼設定、怎麼用。
- 重點：
  1. signUp／signInWithPassword；session＝access token（預設 3600 秒，`jwt_expiry`）＋refresh token（`refresh_token_reuse_interval = 10`）；supabase-js 自動 refresh 與儲存；`onAuthStateChange` 事件（callback 裡不要 await 其他 supabase 呼叫 ⏳ 查證 docs 的 deadlock 警告）。
  2. 信箱驗證（`enable_confirmations`）與 magic link／OTP：本機信寄到 Mailpit `:55424`（⏳ Mailpit API 路徑實測）。
  3. OAuth 在 Supabase 的設定：redirect URL 白名單（`additional_redirect_urls`）、`flowType: 'pkce'`、`exchangeCodeForSession`。本機不能真的連 Google，只講設定與流程。
  4. 伺服器端 session：@supabase/ssr 把 session 存 cookie（`createServerClient` 的 `getAll`／`setAll`）；`getClaims`（驗章，非對稱金鑰時本地驗）vs `getUser`（打 Auth 伺服器）vs `getSession`（不驗，只讀儲存）。
  5. `auth.users` 不對 API 開放 → `public.profiles` 一對一＋`after insert on auth.users` trigger（security definer、`set search_path = ''`）；trigger 失敗會讓註冊失敗。
  6. 一段帶過：MFA 在 Supabase 是 enroll／challenge／verify，完成後 JWT 的 `aal` 變 `aal2`（第 5 課的 restrictive policy 用它，本機要開 `[auth.mfa.totp] enroll_enabled`）；Custom Access Token Hook 能把角色寫進 JWT；匿名登入也是 authenticated 角色的陷阱。
- 💡 實務上：token 過期的 UX；在 Vue 裡用 Pinia 接 onAuthStateChange；auth rate limit（`[auth.rate_limit]`）。
- 練習：
  1. 本機 TS：註冊＋登入＋帶 token 讀自己的訂單（用第 4 課的 policy）。mustFail：用 secret key 讀；把 refresh token 放 URL。
  2. 本機 TS：開啟信箱驗證後，從 Mailpit 取 magic link 並換成 session。mustFail：沒處理「信箱未驗證」的錯誤；從 Mailpit 拿錯信（測試同時寄兩封）。
  3. 本機 TS：伺服器端 handler 用 getClaims 判斷身分。mustFail：用 getSession 的 user 做授權（測試送一個竄改過的 cookie）；沒有 session 時回 200。
  4. 本機 SQL：profiles trigger。mustFail：沒 security definer 導致註冊失敗；沒 set search_path。
- 選擇題：getClaims／getUser／getSession 各信得過什麼；刪掉使用者後舊 access token 還能用多久；為什麼 redirect URL 要白名單。
- 用到：第 3、5 課；auth 課第 4、8、10～14 課（回顧）。版本：@supabase/ssr 0.12.7（⏳ 要用時加進 package.json，先確認 latest）。

### 第 7 課　Storage：bucket、policy、signed URL 與上傳｜`07-storage.html`
- 情境：收據要讓顧客上傳、只有本人和店員看得到；有人為了方便把 bucket 設成 public。
- 重點：bucket（public／private、`file_size_limit`、`allowed_mime_types`）；檔案 metadata 是 `storage.objects` 的列，權限就是它的 RLS（第 4、5 課的寫法直接套用）；路徑慣例 `<user_id>/檔名` 配 `storage.foldername(name)`；upload／upsert 需要 INSERT＋SELECT＋UPDATE；signed URL（有效期限）vs public URL；大檔用 resumable（TUS）一句；圖片轉換是付費功能（本機排除 imgproxy）。上傳檔案的通用檢查（大小、類型看檔頭）回顧 nestjs 課第 22 課；S3 的 presigned URL 對照 data-stores 課第 12 課。
- 練習：本機 SQL：收據 bucket policy（只能存取自己資料夾、店員看自己分店）；本機 TS：上傳＋產生 60 秒 signed URL。mustFail：policy 只寫 INSERT（upsert 失敗）；用 public bucket 放收據；路徑沒檢查第一層資料夾。
- 選擇題：signed URL 過期後已下載的檔案；public bucket 的 policy 管不管讀取；upsert 要哪些 policy。
- bucket 名稱：`<slug>-receipts`。
- 用到：第 4、5 課。
- 階段檢核（涵蓋第 6、7 課）。

## 階段 4：伺服器端邏輯與上線

### 第 8 課　伺服器端邏輯放哪裡：資料庫函式（RPC）與 Edge Functions｜`08-rpc-edge-functions.html`
- 情境：結帳要「扣庫存＋建訂單＋算總價」，前端分三次呼叫，中間失敗留下半張訂單、價格還是前端傳的；另一個需求要呼叫外部金流 API，key 不能放前端。
- 重點：
  1. 判斷表：只動自己的資料、權限能用列表達 → 直接打 Data API；多步驟寫入要在同一個交易 → RPC；要呼叫外部服務、要藏 secret、要接 webhook → Edge Function；流程長、跨系統、要排程與重試、團隊熟 Node → 自己的 NestJS 服務（混合架構）。這是這門課「何時用 BaaS」的核心判斷。
  2. RPC：plpgsql 函式＋`supabase.rpc()`，函式內是一個交易；預設 security invoker（RLS 照套）、需要 definer 時照第 5 課的規則；函式的權限：`revoke execute … from public`、`grant execute … to authenticated`（⏳ 實測 `auto_expose_new_tables = false` 對新函式的預設權限有沒有影響）。函式語法回顧 PostgreSQL 課第 23 課。
  3. Edge Functions：Deno 執行環境、`supabase functions serve`；預設驗 JWT（`verify_jwt`）；secrets（`supabase/functions/.env`、`secrets set --remote`）；用使用者的 Authorization 建 client（保留 RLS）vs 用 secret key 建 admin client（繞過 RLS，只在真的需要時）。
  4. 一段帶過、不出題：trigger 維護欄位、pg_cron 排程、pgmq 佇列（回顧 PostgreSQL 課第 23、33 課，nestjs 課第 20、21 課）；webhook 要關掉 `verify_jwt` 並自己驗簽章、做冪等（回顧 nestjs 課第 22 課、delivery 課第 8 課）。
- 💡 實務上：價格一律在伺服器端從 products 讀；Edge Function 有執行時間與記憶體上限（⏳ 查官方 limits 並寫日期），長流程不要放這裡。
- 練習：
  1. 本機 SQL：`place_order(items jsonb)` 在一個交易裡建訂單與品項、從 products 計算總價。mustFail：用前端傳入的 unit_price；security definer 沒檢查 auth.uid()；沒 revoke public 的 execute。
  2. 本機 Edge Function：`checkout` 用呼叫者的 JWT 建 client 呼叫 `place_order`，再用 secret 呼叫測試開的假金流 API。mustFail：用 secret key 建 client（測試用別人的訂單 id 驗證會越權）；金流 key 寫死在程式碼；`verify_jwt = false`。⏳ edge-runtime 在平行判分下怎麼載入學習者的函式（多半是判分時把函式資料夾複製成 `supabase/functions/<slug>-…`，edge-runtime per_worker 熱載入；要實測）。
  3. 瀏覽器 TS：`whereToPut(requirement)` 依需求特徵（多表交易、外部 API、secret、長時間、排程）回傳 data-api／rpc／edge-function／own-backend。mustFail：只要有寫入就選 edge-function；長時間流程放 Edge Function。
- 選擇題：前端連續兩次 insert 為什麼不安全；Edge Function 用 secret key 的風險；什麼情況該改用自己的 NestJS。
- 用到：第 2、5 課；PostgreSQL 課第 18、23 課；system-design 課第 15 課（混合架構，延伸）。

### 第 9 課　期末專題：咖啡店點餐上線，修好權限漏洞，決定要不要留在 Supabase｜`09-capstone.html`
- 三段：
  1. **Migration**（原第 14 課）：`supabase migration new`、`db diff`（v3 預設 pg-delta）、seed、`db push --remote --yes`（v3，只寫指令與說明，不實際推雲端）、declarative schema 一段、CI 用 GitHub Actions `supabase/setup-cli` 一段。把前面幾課的點餐功能（orders policy、place_order、收據 bucket policy）整理成 migration 檔。限制：不能在共用 stack 上 `db reset`；判分時把學習者的 migrations 依序套進 t_<slug>，檢查結果並再套一次確認冪等 ⏳。migration 的觀念回顧 PostgreSQL 課第 22 課、devops 課第 17 課。
  2. **修權限漏洞**：start 裡埋 4 個（view 沒 security_invoker、UPDATE 沒 WITH CHECK、storage policy 漏路徑檢查、security definer 在 public）。讀者先寫 RLS 測試（第 5 課的測法）抓到它們，再修好；測試用「還沒修的版本」跑讀者的測試，要能抓到。
  3. **決策紀錄**（原第 15 課的內容變成材料）：給咖啡店一年後的情境（多一個要串 POS 與對帳的需求、流量、預算），讀者寫 `decision.md`：繼續用 Supabase、混合（加 NestJS 服務）、還是搬離，格式照 system-design 課第 18 課的 ADR。課文提供要考慮的事實：連線池（Supavisor transaction mode 6543 vs session mode 5432，serverless 用 transaction mode、prepared statement 的限制）、備份與 PITR、advisors、費用項目（compute、egress、MAU）、搬離的成本（`pg_dump` 帶得走資料，帶不走的是 Auth、Storage、RLS 依賴的 `auth.*` 函式）。⏳ 每個數字查官方 pricing／docs 並寫查詢日期。測試檢查結構（有背景、選項、決定、代價），不判斷結論對錯。
- 階段檢核（涵蓋第 8、9 課與全課的判斷題）。
- 用到：全課。
