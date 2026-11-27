---
title: 認證與資安 階段 5：授權：能做什麼、能看哪些資料
subtitle: 第 18～21 課一頁圖解：RBAC、BFLA、BOLA、BOPLA、ABAC、多租戶隔離、在 NestJS 實作認證與授權
cols: 3
theme: shadcn
課程: 認證與資安 第 18～21 課
---
授權分三層：RBAC 管「能不能做這類動作」，物件層級管「能不能碰這一筆」，多租戶管「這筆是哪個品牌的」。檢查寫在伺服器：找不到政策就拒絕，找不到租戶就失敗關閉；前端只決定顯示什麼。[回 認證與資安 學習地圖](../index.html)

## A RBAC：程式只檢查權限，不檢查角色 {span=2}
```flow LR
[使用者] -> [角色]: 有
[角色] -> *[權限 資源:動作]: 有
[owner 老闆] -> [manager 店長]: 繼承
[manager 店長] -> [shift_lead 班長]: 繼承
[shift_lead 班長] -> [barista 吧台]: 繼承
```
這課的咖啡店設計（箭頭指向被繼承的角色；顧客不在這條鏈上）：吧台能 `order:refund_request` 發起退款，班長加上 `order:refund` 核准，店長再加上 `order:refund:large`。每個角色擁有被繼承角色的全部權限，再加上自己的；繼承讓設定變短，但要能列出一個角色的完整權限。
- 權限從系統的動作設計；需要「只能做 A 不能做 B」的就拆開。
- `as const` 加 `typeof` 從清單推導 Permission，`satisfies` 檢查角色定義，拼錯就是編譯錯誤；資料庫來的角色仍要在執行時處理。
- 展開繼承：不認得的角色沒有權限、用 `Object.hasOwn` 查表、記錄走過的角色防止繞圈。

## B RBAC 的規則與極限
```kv cols=1
擋 BFLA: OWASP API5:2023；每個路由都有政策、找不到政策就拒絕、自動檢查沒有政策的路由
職責分離: 發起與核准分給不同權限，核准時比對發起者
最小權限: owner 帳號平常不用，緊急存取帳號留紀錄
前端: 用 GET /me/permissions 決定顯示什麼，API 照樣檢查
極限: 只管「能不能做這類動作」，管不了「這一筆」；硬用角色表達會角色爆炸
```

## C BOLA：有功能權限不代表能碰每一筆 {span=2}
```sql
SELECT * FROM orders WHERE id = $1 AND customer_id = $2
```
- 在查詢時就加上擁有者條件；讀、改、刪、列表、匯出、附件全部走同一個函式。
- 查不到與沒權限都回 404。RLS 是資料庫層的第二道防線。
- UUID 不是授權，它只讓猜測與列舉變難。
- 物件層級授權只有你的程式知道，框架幫不了（OWASP API1）。

## D BOPLA：欄位層級
| 方向 | 問題 | 做法 |
|---|---|---|
| 寫入 | mass assignment | 允許清單（含 `__proto__`），驗證全部通過才組出新物件 |
| 回應 | 回傳太多 | 依「誰在看」挑欄位，用 `Pick` 不用 `Omit` |

這是 OWASP API3。

## E RBAC、ABAC、ReBAC 怎麼選
| 模型 | 管什麼 | 什麼時候用 |
|---|---|---|
| RBAC | 功能 | 這類動作能不能做 |
| ABAC | 條件：主體、資源、動作、環境的屬性 | 規則少時用 ABAC 函式 |
| ReBAC | 關係 | 關係多層又要跨服務共用時才考慮 |

ABAC 政策寫成注入 now 的純函式（PDP），集中一處，由 controller、service 執行（PEP）。

## F 多租戶：隔離方式 {span=2}
| | 共用表加 tenant_id | 每租戶一個 schema | 每租戶一個資料庫 |
|---|---|---|---|
| 隔離靠什麼 | 程式與 RLS | 連線時切換 search_path | 連到哪個資料庫 |
| 成本 | ok 最低 | warn 中等 | no 最高，維運最重 |
| 適合 | 多數的起點 | 租戶不多、要較強隔離 | 大客戶、法規要求分開存放 |

漏掉隔離時通常沒有錯誤訊息，只是「多看到一點別人的資料」。租戶上下文來自登入的主體；標頭、body、子網域都只是提示。

## G 讓「忘了加 tenant_id」變成不可能
```kv cols=1
第一道: repository 從上下文（AsyncLocalStorage）自動加條件；寫入時由上下文填 tenantId
第二道: 複合外鍵擋跨租戶參照
第三道: RLS 擋繞過 repository 的查詢，變數在交易裡用 SET LOCAL
找不到租戶: 一律失敗關閉
```
- 資料離開請求的地方（快取 key、背景工作、檔案路徑、搜尋、匯出、log）都要明確帶租戶。
- 平台人員跨租戶存取：明確切換、填理由、限時、唯讀、寫稽核紀錄。
- 資源依租戶限流與配額，避免雜訊鄰居。

## H 在 NestJS 實作：每一關各回各的狀態碼 {span=3}
```flow LR
(請求 Bearer token) -> [JwtAuthGuard 你是誰] -> [PermissionsGuard 能做這件事嗎] -> [controller 取參數] -> *[service 能動這一筆嗎]
[JwtAuthGuard 你是誰] --> [401 沒 token、無效、過期、被撤銷]
[PermissionsGuard 能做這件事嗎] --> [403 沒有權限、路由沒宣告權限]
*[service 能動這一筆嗎] --> [404 不存在或不是你的]
```
| 部分 | 做法 |
|---|---|
| 密碼 | `node:crypto` 的 argon2id（Node 24.7.0 起內建），存 PHC 字串，驗證用字串裡的參數；每次雜湊佔 19 MiB、在 thread pool 上排隊，要壓測、要限流 |
| JwtModule | `verifyOptions` 固定 algorithms、issuer、audience；payload 只放 `sub`、`ver`；簽發與驗證都用注入的時鐘 |
| 全域 guard | JwtAuthGuard 預設必須登入，驗證後查資料庫得到最新的使用者；PermissionsGuard 預設拒絕，權限依資料庫裡的角色；`@Public()` 的路由兩個都放行 |
| refresh token | 只存 SHA-256，放在 `__Secure-`、HttpOnly、SameSite=Strict、`Path=/auth` 的 cookie；輪替用原子更新，重用時撤銷整個家族；`/auth/refresh` 再加 Fetch Metadata 檢查 |

資安測試從攻擊者的角度寫，每條攻擊配一個正常使用的對照組。
