---
title: Supabase 階段 3：Auth 與檔案
subtitle: 第 6～7 課一頁圖解：session、magic link、伺服器端驗證、profiles trigger、Storage 的 bucket、policy 與 signed URL
cols: 3
theme: shadcn
課程: Supabase 第 6～7 課
---
登入給的是一張會過期的 JWT，誰信得過它要看有沒有驗簽章；檔案的權限還是 RLS，只是表換成 `storage.objects`。[回 Supabase 學習地圖](../index.html)

## A 登入之後手上有什麼
```tree list
session
  `access_token` | JWT，預設 3600 秒（jwt_expiry），每個請求帶在 Authorization
  `refresh_token` | 換新 access token，只能用一次（輪替，寬限 10 秒）
  `user` | 登入當下的使用者資料
```
整個前端共用一個 client，讓 supabase-js 自動換新與保存。每次 `createClient`、把 token 複製出來自己 fetch，一小時後就 401。`onAuthStateChange` 用同步 callback，只更新狀態。

## B 登入失敗看 error.code
| code | 意思 | 畫面 |
|---|---|---|
| `invalid_credentials` | email 或密碼錯 | 帳號或密碼錯誤 |
| `email_not_confirmed` | 還沒點驗證信 | 請先去收信，附重寄按鈕 |
| `otp_disabled` | magic link 給了沒註冊的 email | 加 `shouldCreateUser: false` 才會有這個錯 |

magic link：`signInWithOtp` 寄信（本機在 Mailpit），信裡的 token hash 用 `verifyOtp({ token_hash, type: 'email' })` 換成 session，只能用一次。

## C 伺服器端信得過什麼 {span=2}
| 方法 | 做了什麼 | 能做授權嗎 |
|---|---|---|
| `getSession()` | 讀出 cookie 裡的 session，不驗簽章 | no 改 cookie 就能變成別人 |
| `getClaims()` | 驗簽章與到期，非對稱金鑰在本地驗（JWKS 快取） | ok 首選 |
| `getUser()` | 每次問 Auth 伺服器 | ok 還能發現使用者已被刪除 |

@supabase/ssr 把 session 存在 cookie `sb-<代號>-auth-token`。刪掉使用者後，手上的 access token 到期前仍能通過 PostgREST 與 `getClaims()`，refresh token 已經作廢。

## D profiles 與 trigger
```flow LR
[signUp] -> [(auth.users)]: Auth 以 supabase_auth_admin 新增
[(auth.users)] -> [handle_new_user]: after insert trigger
[handle_new_user] -> [(public.profiles)]: security definer，search_path 鎖成空的
```
```callout err trigger 失敗，註冊就失敗
沒有 security definer、not null 欄位沒給值，所有人都看到 Database error saving new user。display_name 從 raw_user_meta_data 取，記得 coalesce。
```

## E OAuth、MFA、匿名登入一句話
- OAuth：設定 provider 與 redirect 白名單（`site_url`、`additional_redirect_urls`），瀏覽器用 PKCE，跳回來 `exchangeCodeForSession`。
- MFA：enroll、challenge、verify 後 token 的 `aal` 變成 `aal2`。
- 匿名登入也是 `authenticated`，要區分看 `is_anonymous`。

## F Storage 的權限就是 storage.objects 的 RLS {span=2}
| 動作 | 要的 policy |
|---|---|
| `upload` | INSERT |
| `upload` 加 `upsert: true` | INSERT＋SELECT＋UPDATE |
| `download`、`list`、`createSignedUrl` | SELECT |
| `remove` | SELECT＋DELETE |

路徑第一層放擁有者的 id：`bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text`。每條都寫 bucket_id；INSERT 的 WITH CHECK 一定要檢查路徑；店員看 `app_metadata`。直接 delete storage 的表會被擋，刪檔走 Storage API。

## G public bucket 還是 signed URL
| | public bucket | private bucket＋signed URL |
|---|---|---|
| 讀取經過 policy | no 知道網址就能下載 | ok 產生網址時檢查 SELECT |
| 適合 | 商品圖、大頭貼 | 收據、證件 |
| 到期 | 不會 | 到期後網址失效，已下載的檔案收不回 |

資料庫存路徑，不存 signed URL；多張用 `createSignedUrls` 一次換。bucket 設 `file_size_limit` 與 `allowed_mime_types`，mime type 是宣告的，不是檔頭。
