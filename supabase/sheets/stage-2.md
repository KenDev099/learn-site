---
title: Supabase 階段 2：Row Level Security
subtitle: 第 4～5 課一頁圖解：auth.uid()、USING 與 WITH CHECK、多租戶、security definer、view 與漏洞清單
cols: 3
theme: shadcn
課程: Supabase 第 4～5 課
---
RLS 是加在每一列的條件：讀取被擋是查不到，寫入被擋是 42501。有登入不等於是主人，分人只能靠 `auth.uid()` 與使用者改不到的資料。[回 Supabase 學習地圖](../index.html)

## A 擁有者 policy 與 API 看到的結果 {span=2}
```flow LR
[請求帶 JWT] -> [auth.uid 讀 sub]
[auth.uid 讀 sub] -> {customer_id 等於 uid?}
{customer_id 等於 uid?} -> [看得到這一列]: 是
{customer_id 等於 uid?} -> [這一列像不存在]: 否
```
`for select to authenticated using (customer_id = (select auth.uid()))`。未登入時 `auth.uid()` 是 NULL，比對不是 true。把網址的 id 改成別人的訂單，API 回 `null`，不是 403。

## B USING 與 WITH CHECK
| 動作 | USING | WITH CHECK |
|---|---|---|
| SELECT、DELETE | ok 既有的列 | no 沒有 |
| INSERT | no 寫了會報錯 | ok 新列 |
| UPDATE | ok 能改哪幾列 | ok 改完的樣子，不寫時沿用 USING |

被 USING 擋：讀取 `[]`、改刪 0 列。被 WITH CHECK 擋：42501 new row violates row-level security policy。

## C UPDATE 的兩個陷阱
```callout err WITH CHECK 寫成 true
作者能把評論的 author_id 改成別人，資料被轉移或冒名。WITH CHECK 寫一樣的擁有者條件，GRANT 只開放能改的欄位。
```
```callout warn 沒有 SELECT policy
UPDATE 用到 WHERE 時要先看得到那一列：回 204、改了 0 列、沒有錯誤。接 `.select()` 看是不是 `[]`。
```

## D 多租戶與遞迴 {span=2}
```flow LR
[orders policy] -> [private.my_store_ids]
[store_members policy] -> [private.my_store_ids]
[private.my_store_ids] -> [(store_members)]: security definer，不套用 RLS
[store_members policy] --> [(store_members)]: 直接查自己會 42P17 無限遞迴
```
成員表 `store_members(store_id, user_id, role)`；policy 寫 `store_id in (select private.my_store_ids())`。每張表直接帶 store_id。

## E security definer 函式的三扇門
- 放 private schema：公開 schema 的函式都能用 `rpc()` 呼叫。
- `set search_path = ''`，函式裡的名稱都寫完整。
- `revoke execute … from public`，只 grant 給 authenticated；Postgres 預設所有角色都能執行新函式。

## F 角色放哪裡
| 資料 | 誰能改 | 能不能用來授權 |
|---|---|---|
| user_metadata | 使用者自己（signUp、updateUser） | no 誰都能當店長 |
| app_metadata | 只有伺服器的 admin API | ok `(select auth.jwt()) -> 'app_metadata' ->> 'role'` |
| JWT 最外層 role | — | no 永遠是 authenticated |
| 資料表 | 依你的 policy | ok 需要立即生效時用 |

JWT 簽發後內容固定，改了 app_metadata 要等 refresh。

## G 繞過 RLS 的 view 與 restrictive policy
- view 預設以建立者身分讀表：加 `with (security_invoker = true)`。
- restrictive policy 與其他 policy 是 AND，例如 `aal = 'aal2'` 才能改分店設定；要搭配一個 permissive policy 才會放行。
- policy 是每一列的條件：`(select auth.uid())` 只算一次，條件欄位要有索引。

## H 上線前的漏洞清單 {span=2}
| 漏洞 | 狀態 |
|---|---|
| public 的表沒開 RLS | no 用 `db advisors --type security` 抓 |
| `using (true)`、只寫 `to authenticated` | no 要有擁有者或成員條件 |
| WITH CHECK 比 USING 寬鬆 | no 寫一樣的條件 |
| 用 user_metadata 判斷權限 | no 改用 app_metadata |
| security definer 放 public、沒鎖 search_path | no 三扇門都關 |
| view 沒有 security_invoker | no advisor 抓得到 |
| Storage policy 漏寫、secret key 外洩 | warn 第 7 課、第 3 課 |

工具抓不到條件寫錯：每張表測「自己看得到、別人看不到、不能改成別人的」。
