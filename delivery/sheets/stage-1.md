---
title: 產品交付實戰 階段 1：接手與第一個需求
subtitle: 第 1～4 課一頁圖解：接手專案、釐清需求與驗收條件、跨層功能、前後端契約與不同步發布
cols: 3
theme: shadcn
課程: 產品交付實戰 第 1～4 課
---
先用程式和實際請求確認系統怎麼動，再把需求寫成帶邊界例子的驗收條件。每一片從資料庫做到畫面，新舊版本混用時也要安全。[回 產品交付實戰 學習地圖](../index.html)

## A 追一筆訂單：從按鈕到資料表 {span=2}
```flow LR
[CheckoutPage.vue 的 submit] -> [web/src/api/orders.ts 的 createOrder]
[web/src/api/orders.ts 的 createOrder] -> [Vite 5174]: client.ts 的 api 送出 POST /api/orders
[Vite 5174] -> [OrdersController.create]: proxy 拿掉 /api，API 在 3100
[OrdersController.create] -> *[OrdersService.create]: 查顧客、查價格、算總價
[OrdersService.create] -> [(PostgreSQL 5436)]: 寫 orders 與 order_items，products 只讀
```
啟動順序：`docker compose up -d --wait` → `npm run db:setup` → `npm run dev`。用路由字串搜尋（`grep -rn "Controller('orders')" api/src`）、Network 面板、psql 確認每一站。回應標頭 `x-request-id` 和 API log 的 `requestId` 相同，把一次點擊和一行 log 對起來。

## B README 不可信時，去哪裡找答案
| 想知道 | 去看 |
|---|---|
| 有哪些指令 | 根目錄 package.json 的 scripts |
| 環境變數 | `api/.env.example`、讀 `process.env.X` 的地方 |
| API 的 port | `api/src/main.ts` 的 `listen(…)`、啟動 log |
| 前台的 port | `web/vite.config.ts` 的 `server.port` |
| 資料庫在哪 | compose.yaml 的 ports |

以程式為準修文件，不改程式去配合文件。只想停容器用 `stop` 或不加 `-v` 的 `down`；`down -v` 會刪掉資料庫的 volume。

## C 接手第一週發現的問題
```callout warn 先記錄，不要順手修
改東西之前先送邊界輸入確認實際行為。發現的問題寫進 `docs/KNOWN_ISSUES.md`，一個問題三行：重現指令、影響、優先序（P1 最急，P3 可以排後面），交給團隊排。
```
- 你還不知道有沒有人依賴這個行為。
- 順手修的東西混進第一個 PR，review 分不清需求和你的判斷。
- 找證據約 30 分鐘沒有新線索就問人，帶著已經查到的東西去問。

## D 一句話的需求單：問題與驗收條件
| 問法 | 結果 |
|---|---|
| 「最快可以多久後取？」 | no 換來另一個模糊回答 |
| 「至少在送出的 15 分鐘後，時段 15 分鐘一格，例如 08:02 送出最早選 08:30，對嗎？」 | ok 對方回對或不對就好 |

可執行的驗收條件：Given/When/Then 加具體例子。每條規則要有接受、拒絕、邊界；邊界例子只讓一條規則落在分界上，例如 08:00 送出選 08:15 接受、08:01 送出選 08:15 拒絕。時間寫成帶位移的 ISO 8601（`2026-11-03T08:15:00+08:00`），`Z` 是 UTC：`07:00Z` 是台北 15:00。

## E 垂直切片與 PR 說明
```kv cols=1
垂直切片: 每一片從資料庫做到畫面，做完就能安全上線。CAFE-12 第一片是「今天的時段＋每時段 10 單」，取消預約放第二片
容量為什麼在第一片: 沒有上限，大家選同一個時段吧台會爆，這一片不能單獨上線
PR 五段: 目的、變更內容、驗收條件對照、如何驗證、風險與回滾
刪欄位的 migration: revert 只還原程式，資料救不回來；先備份，或先停用、下一版再刪
```

## F 時間：存絕對時間點，用台北時區判斷
| 寫法 | 結果 |
|---|---|
| 欄位 `timestamptz`，可為 NULL | ok 存絕對時間點；NULL＝現點現做 |
| `Intl.DateTimeFormat` 指定 `timeZone: 'Asia/Taipei'` | ok 不受機器時區影響 |
| `getHours()`、`toISOString()` 取日期 | no 在 UTC 的正式機差 8 小時，台北 08:00 前會算成昨天 |
| 程式裡直接 `new Date()` | no 測試只能在特定時間跑 |

「現在」從可注入的 `Clock` 取得，測試用 `overrideProvider` 換成固定時間。規則寫成純函式 `todaySlots(now)`，列時段和驗證共用。已經套用的 migration 不改；Prisma 7 改完 schema 要自己跑 `prisma generate`。

## G 每個時段最多 10 單：條件式更新 {span=2}
```sequence
participants: 請求 A, pickup_slots, 請求 B
請求 A -> pickup_slots: SELECT → 9
請求 B -> pickup_slots: SELECT → 9
請求 A -> pickup_slots: UPDATE orders + 1
請求 B -> pickup_slots: UPDATE orders + 1
note 請求 A, 請求 B: 先查再寫：兩個都看到 9，變成 11，超賣
== 檢查和寫入合成一句 ==
請求 A -> pickup_slots: UPDATE … SET orders = orders + 1 WHERE … AND orders < 10
請求 B -> pickup_slots: 同一句，等 A 提交後用最新的值重新檢查 WHERE
pickup_slots --> 請求 A: 影響 1 列，搶到
pickup_slots --> 請求 B: 影響 0 列，回 409 SLOT_FULL
```
佔名額和建立訂單放在同一個 `$transaction`、都用 `tx`，搶鎖的步驟放最後。422 是這個時間本來就不能選；409 `SLOT_FULL` 是被搶走了，前台用 `ApiError` 讀 code，顯示已額滿、重新載入時段、保留購物車。API 記憶體裡的計數器守不住：每台各記各的，重啟就歸零。

## H 改欄位名稱：每個中間狀態都要安全 {span=3}
| 步驟 | 線上的組合 | 為什麼安全 |
|---|---|---|
| 1 API 同時接受 `note` 與 `customerNote` | 舊前台＋新 API | ok 送 note、讀 note 都照舊；收到 note 加 `Deprecation` 標頭、寫 warn log |
| 2 前台改送 `customerNote` | 新前台或舊分頁＋新 API | ok API 兩種都懂；之後 API 最舊只能回滾到步驟 1 |
| 3 等 warn log 連續一段時間是 0 | 什麼都不改 | ok 舊分頁消失要用資料判斷 |
| 4 刪掉 note 的相容程式 | 已確認沒有人送 note | ok 由步驟 3 的 log 確認；資料庫不動 |
| 前後端直接一起改名 | 舊分頁＋新 API | no `z.object` 默默丟掉 note，回 201，備註不見 |

前後端不會同時更新：開著的分頁、CDN 快取、單獨回滾都會混用新舊版本。契約寫在 `shared/contract.ts` 的 zod schema：API 用 `@Body({ schema })` 驗證，前台用 `z.infer` 的型別、`safeParse` 檢查回應，錯誤一律是 `{ code, message }`。相容期回應同時回 note 與 customerNote；兩個都送而且不同時回 422 `FIELD_CONFLICT`。
