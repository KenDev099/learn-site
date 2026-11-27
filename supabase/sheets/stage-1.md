---
title: Supabase 階段 1：一個 Postgres 加上一組服務
subtitle: 第 1～3 課一頁圖解：服務組成、Data API 與 supabase-js、API key、角色與 GRANT
cols: 3
theme: shadcn
課程: Supabase 第 1～3 課
---
Supabase 省掉 API 樣板程式，但省不掉權限設計。前端直接打自動產生的 API，誰能碰哪張表、哪幾列，全寫在資料庫裡。[回 Supabase 學習地圖](../index.html)

## A 一個請求怎麼走 {span=2}
```flow LR
[瀏覽器 supabase-js] -> [API gateway]: apikey＋JWT
[API gateway] -> [PostgREST]: /rest/v1
[API gateway] -> [Auth]: /auth/v1
[API gateway] -> [Storage]: /storage/v1
[PostgREST] -> [(PostgreSQL)]: 換成角色查詢
[Auth] -> [(PostgreSQL)]
[Storage] -> [(PostgreSQL)]
[(PostgreSQL)] --> [GRANT＋RLS]: 擋人的在這裡
```
Supabase＝一個你完全擁有的 PostgreSQL＋一組服務，前面由 gateway 依路徑轉送。本機用課程鎖定的 CLI 3.1.0，port 改成 554xx。

## B 同一份資料三個入口
| 入口 | 身分 | 受權限限制 |
|---|---|---|
| 直連資料庫（`db query`、Studio） | postgres | no 不受 GRANT、RLS 限制，只給開發者 |
| HTTP `/rest/v1/表` | 依 key 與 JWT | ok GRANT＋RLS |
| supabase-js | 同 HTTP | ok 它只是包裝 fetch |

查不到資料時先分清楚：42501 還是空陣列。

## C supabase-js 變成網址
```kv cols=1
select('name, price'): select=name,price，只拿需要的欄位
lte、in、ilike、is: price=lte.100 這類篩選，交給資料庫算
order('price').order('id'): 分頁要配唯一的第二排序
range(from, to): offset 與 limit，兩端都包含
select('id, order_items(…, products(name))'): 靠外鍵嵌入，一次請求解決 N+1
```
嵌入的條件預設只篩子表，`!inner` 才連父表一起篩。

## D 寫入與錯誤的陷阱
- insert 預設不回傳資料：要 `.select()`，一筆再 `.single()`。
- `single()` 在 0 筆時是錯誤 PGRST116；可能不存在用 `maybeSingle()`。
- update、delete 沒有篩選回 21000（safeupdate），它是防呆不是權限。
- supabase-js 回 `{ data, error }` 不丟例外，一定要檢查 error。
- 一個請求最多 `max_rows` 1000 列，超過直接截掉。
- `npx supabase gen types typescript` 產生 Row、Insert、Update 型別，型別檔進 git。

## E 請求怎麼變成資料庫角色 {span=2}
```sequence
請求 -> gateway: apikey，可能還有使用者 JWT
gateway -> gateway: 沒帶 JWT 就依 key 補一張 anon 或 service_role
gateway -> PostgREST: 轉送
PostgREST -> PostgREST: 驗 JWT 簽章與 exp
PostgREST -> PostgreSQL: set local role、request.jwt.claims
PostgreSQL -> PostgreSQL: auth.uid() 讀 sub，再過 GRANT 與 RLS
```
帶了使用者 JWT 時以 JWT 為準：就算 apikey 是 secret key，也是那個使用者，RLS 照樣套用。

## F 兩種 key 與五個角色
| 角色 | 誰會變成它 | 重點 |
|---|---|---|
| anon | publishable key、沒登入 | ok 只有你 GRANT 給它的 |
| authenticated | 帶使用者 JWT | warn 所有登入的人共用，分人要靠 `auth.uid()` |
| service_role | secret key、沒帶 JWT | no 繞過 RLS，只放伺服器；仍要 GRANT |
| authenticator | PostgREST 的連線帳號 | 只能切換成上面三個 |
| postgres | 直連 | 表的擁有者，不會出現在 API 請求 |

key 代表哪個 app，不代表哪個人；publishable key 本來就公開。

## G 兩道門與新表的步驟
| 門 | 沒過時 API 回 | 怎麼開 |
|---|---|---|
| GRANT（表） | no 42501 permission denied | 最小的 `grant select …` |
| RLS（列） | warn 讀取回 `[]`，寫入回 42501 | enable RLS＋policy |

```callout warn 2026 起新表不會自動開放
順序：建表 → 開 RLS → policy → 最小的 GRANT。遇到 42501 不要關 RLS、不要 `grant all`、不要換 secret key。
```
