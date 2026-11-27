---
title: 認證與資安 階段 3：Token 與 JWT
subtitle: 第 8～11 課一頁圖解：JWT 結構與簽章、JWKS、驗證清單、refresh token 輪替與重用偵測、撤銷、session 與 JWT 的選擇
cols: 3
theme: shadcn
課程: 認證與資安 第 8～11 課
---
JWT 用「不查資料庫」換來「很難撤銷」。驗證時由伺服器決定期待什麼，header 只拿來比對；access token 短命、refresh token 輪替，再依情境決定 session 還是 JWT。[回 認證與資安 學習地圖](../index.html)

## A 兩種 token
| | 不透明 token（session ID） | 自包含 token（JWT） |
|---|---|---|
| 驗證要查資料庫嗎 | 要，每個請求都查 | 不用，驗簽章就好 |
| 能不能隨時撤銷 | ok 刪掉那筆紀錄就失效 | warn 到期前都有效 |
| 內容誰看得到 | 只有伺服器 | 任何拿到 token 的人 |
| 適合 | 單一網站、要能立刻撤銷 | 多個服務各自驗證 |

兩者通常都是 bearer token：誰拿到誰能用，外洩跟密碼一樣嚴重。

## B 拆開一個 JWT {span=2}
```flow LR
[header] -> [payload]: 用 . 串起來
[payload] -> [signature]
[header] & [payload] --> *[簽章簽的是原始的 header.payload 文字]
```
- 三段都是 base64url；payload 只是編碼，任何人都看得到。解碼不等於驗證。
- 註冊 claim：`iss`、`sub`、`aud`、`exp`、`nbf`、`iat`、`jti`；時間是秒；每一項都要收 token 的一方自己檢查。
- 驗證時用收到的那串文字，並用 `crypto.subtle.verify`。

## C HS256、ES256 與 JWKS 輪替 {span=2}
| | HS256 | ES256 |
|---|---|---|
| 類型 | 對稱：HMAC | 非對稱：私鑰簽、公鑰驗 |
| 能驗的人 | warn 能驗就能簽 | ok 驗的人簽不出來 |
| 適合 | 簽和驗是同一方 | 多個服務驗證 |
| 金鑰／簽章 | 金鑰至少 256 bits 隨機值 | 簽章 64 bytes（r‖s） |

公鑰用 JWK 表示、放在 JWKS 公開；header 的 `kid` 只用來在已信任的集合裡選鑰。輪替照這個順序：
```timeline
步驟 1 | 發布新公鑰
步驟 2 | 等快取更新，再用新私鑰簽
步驟 3 | 舊 token 都過期後，才移除舊公鑰
```

## D 驗證清單：照這個順序
```flow TB
(格式) -> [alg 在允許清單] -> [kid 在 Map 裡查表] -> [alg 與金鑰綁定的演算法相符] -> *[簽章]
*[簽章] -> [typ] -> [必要 claim] -> [exp 與 nbf] -> [iss] -> (aud)
```
簽章之前，payload 的內容一個字都不能信。

## E 每一項擋什麼
```kv cols=1
alg: none 與演算法混淆都是「照 header 選演算法」造成的；每把金鑰綁一種演算法
kid、jku、x5u: 攻擊者的輸入；kid 只在 Map 裡查，網址從不讀 token 的
時間: now >= exp + leeway 就是過期；exp 必填；leeway 幾十秒；時間用注入的 now
typ、iss、aud: 一起擋 token 替換；typ 是 at+jwt；aud 可能是字串或陣列，要完全比對
函式庫: issuer、audience、algorithms 不給就不檢查
```
```callout warn 失敗時怎麼回
401 加 `WWW-Authenticate: Bearer error="invalid_token"`；沒帶 token 時只回 `Bearer`。原因只進 log，log 不記整個 token。
```

## F Refresh token：輪替與重用偵測 {span=2}
```sequence
participants: 攻擊者, POS App, 伺服器
note 攻擊者, POS App: 攻擊者偷到 RT1
POS App -> 伺服器: 用 RT1 換新的
伺服器 --> POS App: RT2；RT1 標記已使用
攻擊者 -> 伺服器: 用 RT1
note 伺服器: 已使用的 token 又出現 → 重用
伺服器 --> 攻擊者: 401；家族 F 全部撤銷
POS App -> 伺服器: 重新登入，開新家族 G
```
| | access token | refresh token |
|---|---|---|
| 壽命 | 短命，5～15 分鐘 | 長命 |
| 送到哪 | 每個請求，`Authorization` 標頭 | 只送到 `/auth/refresh` |
| 存在哪 | 記憶體 | `__Secure-`、HttpOnly、SameSite=Strict、`Path=/auth/refresh` 的 cookie |
| 格式 | 通常是 JWT | opaque；資料庫只存 SHA-256，用 `family_id` 串起同一次登入 |

重用時只撤銷那個家族（RFC 9700 §4.14.2）。兩個分頁同時 refresh：前端 single-flight 與 Web Locks，後端用條件更新的影響列數決定誰贏，寬限期只能很短。閒置期限從這張 token 算，絕對期限從家族建立算。

## G 撤銷：讓還沒過期的憑證提早失效
| 做法 | 多快生效 | 每個請求的成本 | 適合 |
|---|---|---|---|
| session | ok 立即 | 查一次 store | 全部 |
| 短效期加撤銷 refresh | warn 最多晚 N 分鐘 | 不查 | 一般登出 |
| jti 黑名單 | ok 立即 | 查一次 Redis，只存到 exp | 撤銷某一張 |
| token 版本 | ok 立即（有快取時晚幾秒） | 查一個欄位，可快取 | 撤銷某人全部 |

後兩種讓驗證變回有狀態。先撤銷、再發新 token；改密碼保留目前這台的 refresh 家族；停權要擋住之後新發的 token。token 只代表「是誰」，「能做什麼」問資料庫，避免過期權限。

## H Session 還是 JWT：依情境選 {span=2}
| 情境 | 選擇 |
|---|---|
| 第一方同站的會員網站 | session cookie |
| 手機 App（店員 POS） | 短效 access 加 refresh 輪替 |
| 多個內部服務驗同一個使用者 | 短效 JWT |
| 第三方存取使用者資料 | OAuth |
| 瀏覽器需要 token | BFF，讓瀏覽器碰不到 token |

水平擴展只要求 session 放在共用的 store，不是選 JWT 的理由。把選擇寫成決策紀錄：背景、選項、決定、後果（含代價）。
