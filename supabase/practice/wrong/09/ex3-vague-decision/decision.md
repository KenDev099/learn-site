# ADR 1：咖啡店的後端要不要繼續用 Supabase

狀態：proposed

## 背景
點餐系統上線一年：三家分店、每月活躍使用者約 8,000 人、資料庫 3 GB、收據檔案 20 GB、每月流量（egress）約 40 GB。
前端直接用 supabase-js，權限全部寫在 RLS；結帳用 place_order（RPC）＋checkout（Edge Function）。目前在 Pro 方案，每月 25 美元（含一台 Micro 的運算額度），用量都在方案內含的範圍。
新需求：每晚 2 點跟 POS 系統對帳、自動開電子發票。POS 的 API 偶爾逾時，要能重試、要能查每一筆的處理進度，整批要跑 10～20 分鐘。
團隊：兩位前端、下個月加入一位熟 NestJS 的後端工程師。預算：每月雲端費用希望控制在 100 美元以內。

## 考慮的選項

### 選項 A：繼續只用 Supabase
對帳寫成 pg_cron 排程呼叫的 Edge Function。優點：不用多維護一個服務。缺點：Edge Function 的整體執行時間有上限（付費方案 400 秒），20 分鐘的批次要拆成很多段；重試與進度追蹤要自己用表與排程拼出來；複雜的對帳規則寫在 SQL 或 Deno 裡，新來的後端工程師不熟。

### 選項 B：混合：Supabase 加上自己的 NestJS 服務
Supabase 繼續管資料、登入、收據與點餐 API；新增一個 NestJS 服務跑對帳與發票的背景工作（佇列、重試、排程），用 transaction mode 的連線池（Supavisor，port 6543）連同一個 Postgres，用專用的資料庫角色、只給它需要的表。優點：點餐功能不用動；長流程放在適合的地方；後端工程師用熟悉的工具。缺點：多一個要部署、監控的服務；權限變成兩套（API 走 RLS，NestJS 在程式裡檢查）；transaction mode 不支援 prepared statement，ORM 要關掉。

### 選項 C：搬離 Supabase，改成自己的 NestJS＋PostgreSQL
資料可以用 pg_dump 帶走，但 Auth（使用者、密碼雜湊、session）、Storage（20 GB 收據與它的 policy）、RLS 依賴的 auth.uid()、auth.jwt() 都要重寫或替換，前端每個 supabase-js 呼叫也要改成新的 API。優點：完全自己掌控，沒有平台限制。缺點：要花數個月重寫已經能用的功能，期間新需求停擺；備份、PITR、連線池、監控都要自己維運。

## 決定
建議可以考慮選項 B：保留 Supabase 處理點餐、登入與收據，另外建一個 NestJS 服務負責對帳與電子發票的背景工作，兩者共用同一個 PostgreSQL。

## 後果
- 好處：點餐系統不用改，對帳流程可以重試、查進度，長時間的批次不受 Edge Function 的時間上限影響。
- 代價：多一個服務的部署、監控與值班成本，雲端費用多一台主機。
- 風險：NestJS 用的資料庫角色不受 RLS 限制，程式裡要自己檢查權限，code review 要特別看；連線池要用 transaction mode 並關掉 prepared statement。
- 要補的事：開啟 PITR 前先評估（每月 100 美元／7 天），預算內先靠每日備份（保留 7 天）並定期演練還原；每次上線前跑 supabase db advisors。
- 重新評估的時機：MAU 接近 10 萬、egress 接近每月 250 GB，或需要 Supabase 沒有的功能時，再寫新的 ADR。
