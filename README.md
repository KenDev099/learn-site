# Learn

一門一門補齊後端知識的互動課程，目標是從前端轉職全端／後端。建議順序（主線與選修）寫在首頁。每一課是一頁，頁面裡就能練習，不用安裝任何東西。

| 資料夾 | 課程 | 課數 |
|---|---|---|
| `postgresql/` | PostgreSQL | 39 / 39 |
| `typescript/` | JS、非同步與 TypeScript | 28 / 28 |
| `node/` | Node.js 核心 | 26 / 26 |
| `nestjs/` | NestJS | 27 / 27 |
| `auth/` | 認證、權限與資安 | 26 / 26 |
| `devops/` | 部署與維運 | 26 / 26 |
| `kubernetes/` | Kubernetes 實戰 | 16 / 16 |
| `delivery/` | 實戰：咖啡店產品交付 | 13 / 13 |
| `data-stores/` | 資料儲存選型：Redis、MongoDB 與搜尋 | 15 / 15 |
| `api-styles/` | API 風格與整合：GraphQL、gRPC 與契約 | 12 / 12 |
| `system-design/` | 系統設計與資深工程實踐 | 22 / 22 |
| `engineering/` | 資深工程師的工作方法 | 10 / 10 |
| `ai/` | AI 應用開發：LLM、RAG 與 Agent | 16 / 16 |
| `career/` | 面試與職涯 | 10 / 10 |
| `web/` | HTML、CSS 與網頁基礎 | 28 / 28 |
| `vue/` | Vue 3 深入與前端架構 | 26 / 26 |
| `react/` | React：給會 Vue 的人 | 25 / 25 |
| `algorithms/` | 演算法與資料結構：面試基礎 | 27 / 27 |
| `portfolio/` | 作品專案：從小專案到多租戶 SaaS 後台 | 19 / 19 |
| `aws/` | AWS 雲端服務實戰（選修） | 11 / 11 |
| `supabase/` | Supabase：用 Postgres 當後端（選修） | 9 / 9 |

## 開啟

在這個資料夾執行：

```bash
python3 -m http.server 8000
```

然後開 http://localhost:8000 。學習進度存在瀏覽器裡，換網址（例如 127.0.0.1 或別的 port）就看不到。

## 線上版

https://kendev099.github.io/learn-site/

這個 repo 是 private，GitHub Pages 不支援，所以另外有一個公開的 `KenDev099/learn-site` 只放內容快照（不含 commit 歷史）。推到 master 之後執行 `./deploy-pages.sh` 更新線上版。學習進度存在瀏覽器裡，線上版與本機的進度不互通；需要本機執行的練習（practice 資料夾）在線上版不能跑。

## 結構

- `index.html`：課程清單；`courses.js`：首頁與圖解總表共用的課程清單
- `sheets.html`：所有階段的一頁圖解總表
- `course.js`：每門課共用的進度、roadmap、選擇題、上下課導覽
- `style.css`：所有頁面共用的樣式
- `<課程>/lab.js`：該課的練習引擎和課程清單 `STAGES`
- `<課程>/sheets/`：每個階段的一頁圖解（草稿 `.md` 與 render 出的 `.html`，做法見 AUTHORING.md）

新增一課：複製同一門課現有的課程頁，再到該課 `lab.js` 的 `STAGES` 填上檔名。

## 測試（開發用）

先在這個資料夾（不是 tests/）開 8000 伺服器，Chrome 的測試會用到。

```bash
cd tests && npm install
node pg-verify.mjs   # Node 裡跑 PostgreSQL 課每題的標準答案與錯誤答案
node pg-cases.mjs    # PostgreSQL 課判分漏洞的回歸案例
node pg-leak.mjs     # 學習者自己 COMMIT 也不會改到頁面上的資料庫（Chrome）
node ts-parity.mjs   # TS 課每題在 tsc 5.9.3 與 7.0.2 的判分一致
node ts-cases.mjs    # TS 課判分漏洞與引擎邊界情況的回歸案例（Chrome）
node pages.mjs       # 逐頁測所有課程：範例、每題錯答／正解、選擇題、手機寬度（Chrome）；測全部時最後也跑 sheets.mjs
node sheets-render.mjs <課程>  # 把 sheets/ 的草稿 render 成 HTML（工具版本固定，第一次會 clone）
node sheets.mjs      # 每個階段的一頁圖解：地圖連結、深淺色、手機寬度、console、比課文舊的提醒（Chrome）
```
