---
title: 認證與資安 階段 2：瀏覽器裡的登入狀態：Cookie、Session 與跨站攻擊
subtitle: 第 4～7 課一頁圖解：Cookie 屬性、session store、逾時與 fixation、同源政策、CORS、CSRF、XSS、CSP
cols: 3
theme: shadcn
課程: 認證與資安 第 4～7 課
---
cookie 讓瀏覽器每次自動帶回 session ID；同源政策只擋「讀回應」，所以跨站請求照樣帶著 cookie 送達，要另外擋 CSRF；而 XSS 讓攻擊者的程式以你的來源執行，會打敗所有 CSRF 防護。[回 認證與資安 學習地圖](../index.html)

## A Session：用一個隨機 ID 串起請求 {span=2}
```sequence
participants: 瀏覽器, API, session store
瀏覽器 -> API: POST /auth/login 帳號密碼
API -> session store: 存 SHA-256(token)
API --> 瀏覽器: Set-Cookie __Host-sid=token
瀏覽器 -> API: 之後每個請求自動帶 Cookie
API -> session store: 用 SHA-256 查，檢查逾時
note 瀏覽器, API: HTTP 是無狀態的，cookie 負責把 ID 帶回來
```
`Set-Cookie` 一個 cookie 一行、帶屬性；`Cookie` 只有名稱和值。瀏覽器拒收 cookie 時不會通知伺服器，要看 DevTools。256 bits 的隨機 token 不需要慢雜湊；多台伺服器時 session 放 Redis 這類共用 store。

## B Session cookie 的每個屬性
`__Host-sid=…; Path=/; Secure; HttpOnly; SameSite=Lax`，不設 Domain。

| 屬性 | 擋什麼 |
|---|---|
| `HttpOnly` | JS 讀取；只擋讀取 |
| `Secure` | 中間人 |
| `SameSite` | 跨站 |
| `__Host-` | 子網域覆蓋 |

## C Session 的生命週期
```kv cols=1
逾時: 閒置逾時加絕對逾時一起用；先檢查再延期；時間用注入的 now()
換 ID: 登入、權限提升、改密碼時換新 ID 並刪掉舊的，擋 session fixation
改密碼: 讓其他裝置的 session 全部失效
```

## D 來源、站與 CORS {span=2}
來源 = scheme + host + port；站 = scheme + 可註冊網域（看公共字尾清單）。同源一定同站，同站不一定同源。
```flow LR
(跨來源請求) -> {簡單請求?}
{簡單請求?} -> [直接送出，伺服器照樣執行]: GET HEAD POST 加安全清單標頭
{簡單請求?} -> [OPTIONS 預檢]: 其他
[OPTIONS 預檢] -> {預檢通過?}
{預檢通過?} -> [送真正的請求]: 是
{預檢通過?} --> [真正的請求不送出]: 否
[直接送出，伺服器照樣執行] & [送真正的請求] -> *[回應做 CORS 檢查，通過才交給 JS]
```
```callout warn CORS 不是存取控制
它是伺服器放寬同源政策的方式，由瀏覽器執行。同源政策擋的是讀回應，不是送請求；跨站請求照樣帶著 cookie 送到伺服器。
```

## E 安全的 CORS 設定
- 允許清單逐字比對，回明確的來源。
- 每個回應都加 `Vary: Origin`。
- 帶 cookie 時不能用 `*`；不信任 `null`。
- `Allow-Headers` 明列 `Authorization`。
- 查錯看 Network 面板：先看預檢的狀態碼和標頭，再看真正的回應。

## F CSRF：三個條件，每種防法打破一個 {span=2}
```sequence
participants: 王小明的瀏覽器, evil.example, api.coffee.example
王小明的瀏覽器 -> api.coffee.example: 登入，收到 sid
王小明的瀏覽器 -> evil.example: 打開抽獎頁
evil.example --> 王小明的瀏覽器: 自動送出的表單
王小明的瀏覽器 -> api.coffee.example: POST /orders/42/cancel 自動附上 Cookie
api.coffee.example --> 王小明的瀏覽器: 訂單已取消
```
| 條件 | 打破它的防法 |
|---|---|
| 瀏覽器自動帶 cookie | `SameSite`：Strict 跨站都不帶；Lax 跨站只有頂層導覽的 GET／HEAD 帶；None 一定要 Secure |
| 伺服器只靠 cookie 判斷身分 | Fetch Metadata：`Sec-Fetch-Site` 是 same-origin 或 none 放行，其他（含 same-site）拒絕；其餘規則見 G |
| 請求裡沒有猜不到的東西 | CSRF token 綁 session：`random.HMAC(secret, 長度!sessionId!random)`，用 `crypto.subtle.verify` 驗證，從標頭或表單欄位讀 |

JSON API 可以靠「只收 `application/json` 或自訂標頭」加上正確的 CORS，前提是伺服器拒絕其他格式。

## G CSRF 防法的邊界
```kv cols=1
SameSite Lax: 擋不住會改狀態的 GET、同站子網域、沒寫 SameSite 時的瀏覽器差異；它是縱深防禦
Fetch Metadata: 依 Go 1.25 的四條規則，安全方法放行；same-site 也拒絕；沒有就比 Origin 與 Host；兩個都沒有是非瀏覽器，放行；同站的前台用信任清單放行（原始碼逐步拆解是選讀）
Authorization 標頭: 不受 CSRF 影響，但換成 XSS 偷 token 的風險
登入、登出: 也要防
```

## H XSS 與 CSP {span=2}
| 類型 | 惡意內容在哪 |
|---|---|
| 儲存型 | 資料庫 |
| 反射型 | 網址 |
| DOM 型 | 前端自己把不可信的資料塞進危險注入點 |

得手後 localStorage 的 token 被讀走；HttpOnly cookie 讀不到，但腳本能直接發同源請求。HttpOnly 降低損害，不防 XSS。
```kv cols=1
防在輸出: HTML 內容與屬性用 HTML 編碼（& 先換、屬性加引號）；網址用 new URL 解析，只允許 http／https；資料不拼進 script
Vue: {{ }} 自動跳脫，v-html 與網址不會
要顯示 HTML: DOMPurify 允許清單清理或沙箱 iframe，不自己寫正規表示式
登入後的 next: new URL(next, 自己的來源)，origin 完全相等才導回，結果以 // 開頭也拒絕
```
```callout ok 嚴格 CSP 是最後一道網
`script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`；nonce 每個回應用 CSPRNG 產生 128 bits 以上；不用網域清單、不加 `'unsafe-inline'`；先用 Report-Only 上線。Trusted Types 讓危險注入點只接受 policy 產生的值；NestJS 用 helmet 加上 nosniff、frame-ancestors、Referrer-Policy、HSTS，CSP 要自己改成嚴格版。
```
