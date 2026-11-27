---
title: 作品專案 階段 B2：平台功能
subtitle: 第 11～14 課一頁圖解：稽核紀錄、檔案上傳、背景工作匯出、方案與限流
cols: 3
theme: shadcn
課程: 作品專案第 11～14 課
---
平台功能都繞著同一件事：每一次寫入都在租戶上下文與交易裡完成，一個租戶既看不到、也拖不垮別的租戶。[回作品專案學習地圖](../index.html)

## A 稽核跟業務在同一個交易 {span=2}
```sequence
Service -> DB: db.tx() 開始，set_config 租戶與使用者
Service -> DB: UPDATE projects WHERE id
DB --> Service: count 0
note Service: 丟 404，整個交易回滾，稽核不會留下
== 成功時 ==
Service -> DB: UPDATE projects WHERE id
DB --> Service: count 1
Service -> DB: audit.record(tx, project.updated)
Service -> DB: COMMIT：業務與稽核一起生效
```
稽核記 actorId、action（`資源.動作`）、target、requestId、時間，只記 id，不記密碼、token、個資。`record()` 只收 `tx`，放在最後一步。先記再做、或 commit 之後才記，都會讓兩邊對不上。

## B 只能追加
| app 角色對 audit_logs | 狀態 |
|---|---|
| SELECT、INSERT | ok 給 |
| UPDATE、DELETE | no migration 裡 REVOKE |
| TRUNCATE | no 一開始就不給 |
| API 用擁有者連線 | no 權限收回也沒用，查 pg_stat_activity |

保存期限到了，由擁有者身分的排程丟掉舊分割；寫進 ADR。

## C 檔案上傳的順序 {span=2}
```flow LR
[magic bytes 判斷型別] -> [寫物件 tenants/租戶/files/隨機 id]
[寫物件 tenants/租戶/files/隨機 id] -> [交易：鎖租戶、檢查 project 與容量、寫 metadata 與稽核]
[交易：鎖租戶、檢查 project 與容量、寫 metadata 與稽核] --> [失敗就刪掉剛寫的物件]: 只留孤兒物件
```
大小在 multer 讀資料時擋（`limits.fileSize`，413）。刪除反過來：先刪 metadata，再刪物件，失敗留給排程。使用者的檔名只存在 metadata，不進 key。

## D 下載一律當附件
| 標頭 | 作用 |
|---|---|
| `Content-Disposition: attachment` | 下載，不在分頁打開 |
| `filename*=UTF-8''…` | 中文檔名 |
| `Content-Type` 用偵測出的型別 | 不送回上傳時宣稱的 text/html |
| `X-Content-Type-Options: nosniff` | 瀏覽器不自己猜 |

```callout warn magic bytes 不夠
只檢查開頭幾個 byte；下載標頭是另一道獨立的防線。
```

## E 背景工作：worker 裡沒有請求 {span=2}
```sequence
前端 -> API: POST /exports
API -> DB: 交易：建 exports 列 queued＋稽核
API -> Redis: queue.add，jobId = 匯出 id，只帶 id 與 tenantId
API --> 前端: 202 id、queued
Worker -> Worker: ctx.run 用 job 的 tenantId 重建上下文
Worker -> DB: TenantDb 查詢，extension 與 RLS 照常
Worker -> 儲存: 整份覆蓋同一個 key
Worker -> DB: status done
前端 -> API: GET /exports/id 輪詢，done 後下載
```
不用看得到所有租戶的系統身分。忘了開上下文時 fail closed。至少執行一次，所以冪等。

## F CSV 的兩個坑
| 值 | 輸出 |
|---|---|
| 有逗號、雙引號、換行 | 整格用雙引號包，裡面的雙引號寫兩次 |
| `= + - @` 開頭 | 前面加 `'`，試算表才不會當公式 |

## G 方案上限的競態 {span=2}
```sequence
請求 A -> DB: BEGIN; SELECT tenants FOR UPDATE
請求 B -> DB: BEGIN; SELECT tenants FOR UPDATE
note 請求 B: 等 A 的交易結束
請求 A -> DB: count 2 小於 3，INSERT；COMMIT
DB --> 請求 B: 拿到鎖，count 3
請求 B -> DB: 403 PLAN_LIMIT_REACHED
```
只鎖這個租戶那一列，別的租戶不受影響。成員上限算待接受的邀請；降級不刪資料，只禁止新增。

## H 兩種限流
| | 登入限流 | 每租戶限流 |
|---|---|---|
| 防什麼 | 猜密碼 | 吵鬧的鄰居 |
| 鍵 | email＋IP | tenantId |
| 位置 | 登入的 service | 全域 guard，AccessGuard 之後 |

每租戶的計數放 Redis，多個副本共用。超過回 429 `RATE_LIMITED`＋`Retry-After`；超過方案回 403，不是 429。
