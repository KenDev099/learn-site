---
title: 認證與資安 階段 4：更多登入方式：第三方、多因素與機器
subtitle: 第 12～17 課一頁圖解：OAuth 授權碼與 PKCE、OpenID Connect、TOTP 與復原碼、passkey、帳號流程、API key 與 webhook 簽章
cols: 3
theme: shadcn
課程: 認證與資安 第 12～17 課
---
登入方式越多，入口越多。OAuth 給有範圍、可撤銷的授權，OIDC 在上面加身分；MFA 與 passkey 補強密碼，機器各有證明身分的方式。帳號的安全取決於最弱的那一條流程。[回 認證與資安 學習地圖](../index.html)

## A OAuth 授權碼流程 {span=2}
```sequence
participants: 瀏覽器, 咖啡店後端, 授權伺服器
咖啡店後端 -> 咖啡店後端: 產生 state、code_verifier 存進 session
咖啡店後端 --> 瀏覽器: 導向 /authorize 帶 code_challenge
瀏覽器 -> 授權伺服器: 使用者登入、同意
授權伺服器 --> 瀏覽器: 導回 redirect_uri 帶 code、state、iss
瀏覽器 -> 咖啡店後端: callback
咖啡店後端 -> 咖啡店後端: 比對 state 與 iss，用過即刪
咖啡店後端 -> 授權伺服器: POST /token 帶 code、redirect_uri、code_verifier、client 認證
授權伺服器 --> 咖啡店後端: access token
note 瀏覽器, 授權伺服器: 前端通道只傳短效、一次性的東西；token 只走後端通道
```
OAuth 2.0 是授權框架，不是登入協定：client 不拿到密碼，拿到有範圍、可撤銷的 access token 去呼叫資源伺服器。

## B 每個參數擋什麼
```kv cols=1
state: 綁定使用者 session、一次性，擋授權碼注入
iss: 擋 mix-up
redirect_uri: 精確字串比對，只有 loopback 的 port 例外
PKCE: verifier 是 32 bytes CSPRNG 的 base64url；challenge = BASE64URL(SHA-256(verifier))，只用 S256；公開 client 必須用、機密 client 也建議用；授權伺服器要防降級
授權碼: 一次性、短效、綁定 client_id 與 redirect_uri；重複出現時撤銷已發出的 token
```
照 RFC 9700：不用 implicit、不用密碼授權、access token 限定 audience、公開 client 的 refresh token 要輪替。

## C OpenID Connect：OAuth 加上身分 {span=2}
OIDC = 授權碼流程 + `openid` scope + ID token + nonce + UserInfo + Discovery。RP 是咖啡店，OP 是 Google、LINE。
| | ID token | access token |
|---|---|---|
| 給誰 | client，`aud` = client_id | API |
| 用途 | 登入證明，驗完換成自己的 session | 呼叫 API |
| 拿去打 API | no 不行 | ok |

```flow LR
[iss 完全相等] -> [依設定的演算法驗簽章] -> [aud 有自己、沒有不信任的] -> [exp] -> [iat] -> *[nonce]
```
驗證照 OIDC Core §3.1.3.7，在後端做。state 保護 callback，nonce 把 ID token 綁回這次登入；兩個都存在 session、用過即刪。

## D OIDC 的實務細節
- 用 `(iss, sub)` 認人，不用 email；帳號連結不自動合併，只有 `email_verified === true` 才考慮 email。
- LINE：iss 是 `https://access.line.me`；網頁登入 HS256（金鑰是 channel secret，只放後端），App／LIFF 用 ES256（JWKS）。Google：只用 RS256，iss 有兩種寫法。
- JWKS 要快取：定時重抓、不認得的 kid 限頻率重抓、single-flight、抓不到時沿用舊鑰。
- 身分服務省下大量登入工作，但授權、token 驗證、session、帳號流程的安全仍是自己的責任。

## E MFA：TOTP 與復原碼 {span=2}
MFA 擋住「只知道密碼」的攻擊者（撞庫、雜湊外洩），擋不住即時轉送的釣魚網站。
```flow LR
(未登入) -> [待 MFA，只能驗證]: 密碼正確
[待 MFA，只能驗證] -> *[已登入，記錄 mfaAt]: TOTP 或復原碼通過，換 session ID
[已登入，記錄 mfaAt] -> [敏感操作要求最近驗證過]: step-up
```
| 部分 | 規則 |
|---|---|
| 計算 | HOTP = HMAC-SHA1(秘密, 8 bytes 大端序計數器) → 動態截斷 → `& 0x7f` → mod 10<sup>6</sup> → 補 0；TOTP 的計數器是 `floor(Unix 秒數 / 30)` |
| 驗證 | 剛好 6 個數字、前後各一步、常數時間比較、時間步必須大於上次成功的步、限制嘗試次數 |
| 註冊 | 20 bytes CSPRNG 秘密、base32 不加填充、`otpauth://totp/發行者:帳號?secret=…&issuer=…`、輸入一組正確的碼才啟用、秘密加密存 |
| 復原碼 | 120 bits 以上、只存 SHA-256、比對前正規化、用一次就刪、用了通知 |

NIST SP 800-63B-4：簡訊、語音是受限方式；email 不能當 out-of-band；AAL2 要提供防釣魚的選項。客服與復原流程不能比登入弱。

## F Passkey：用公鑰取代密碼 {span=2}
```sequence
participants: 瀏覽器與認證器, 咖啡店伺服器
咖啡店伺服器 --> 瀏覽器與認證器: challenge（32 bytes CSPRNG、綁 session、5 分鐘）
瀏覽器與認證器 -> 瀏覽器與認證器: 只列出 RP ID 相符的 passkey；使用者解鎖後，認證器簽 authenticatorData 接上 SHA-256(clientDataJSON)
瀏覽器與認證器 -> 咖啡店伺服器: clientDataJSON、authenticatorData、簽章、credential ID
咖啡店伺服器 -> 咖啡店伺服器: 用 credential ID 找出存好的公鑰驗，全部通過才更新狀態；challenge 用一次就刪
note 瀏覽器與認證器, 咖啡店伺服器: clientDataJSON 裡的 origin 由瀏覽器填，釣魚網站拿到的簽章在真網站無效
```
私鑰不離開裝置；註冊時伺服器存 credential ID、公鑰、signCount、BE／BS，資料庫外洩也沒有能拿來登入的東西。
```kv cols=1
authenticatorData: rpIdHash 32 bytes、flags（UP bit 0、UV bit 2、BE bit 3、BS bit 4、AT bit 6、ED bit 7）、signCount 32-bit 大端序
正式環境: 用 @simplewebauthn/server 與 @simplewebauthn/browser，不自己解析 CBOR、COSE、attestation；DER 轉 r‖s 的簽章格式轉換由函式庫處理（細節是選讀）
伺服器檢查: type、challenge、origin、rpIdHash、UP／UV、BE／BS、簽章、signCount（新舊都是 0 不比較）
同步或裝置綁定: 同步 passkey 方便、不怕遺失，風險在雲端帳號；裝置綁定的安全金鑰適合高權限帳號
```
正式環境用成熟的函式庫。

## G 帳號流程：每一條都是登入入口
| 流程 | 規則 |
|---|---|
| 不洩漏帳號存在 | 訊息一致，細節寄到 email；時間一致：不存在也跑假雜湊、停用檢查放在驗證之後、寄信進佇列 |
| 重設密碼 token | 32 bytes CSPRNG、只存 SHA-256、單次、短期限、新申請作廢舊的；連結用 APP_URL；重設頁 `Referrer-Policy: no-referrer`；成功後所有 session 失效、寄通知、不自動登入 |
| 改 email、改密碼、關 MFA | 要重新驗證；改 email 要確認新信箱並通知舊信箱 |
| 擋猜測攻擊 | 疊加：每帳號逐步延遲（有上限，不永久鎖）、每 IP 限流（成功不重設）、異常偵測、外洩密碼檢查、MFA；計數放在共用儲存 |

NIST 要求連續失敗上限不超過 100 次。重要變更都通知本人，登入與帳號事件寫進稽核紀錄。

## H 機器對機器 {span=2}
| 做法 | 適合 |
|---|---|
| API key | 外部合作夥伴 |
| OAuth client credentials | 有授權伺服器的內部服務；換短效、限定 aud 的 access token |
| mTLS | 自己管的基礎設施 |
| webhook 簽章 | 我們通知別人 |

```flow LR
[格式] -> [CRC32 檢查碼] -> [SHA-256 查表] -> *[撤銷、到期、scope]
```
- API key 格式：前綴（區分 live／test）+ 30 個 base62 隨機字元（約 178 bits）+ CRC32 檢查碼。掃描工具能找到外洩的 key，假的 key 不用查資料庫就排除。只存 SHA-256、只顯示一次；輪替靠新舊並存的重疊期，外洩時先撤銷再調查。
- Standard Webhooks：簽 `id.timestamp.payload`，`v1,` 加 base64 的 HMAC-SHA256；接收方用原始 body 驗證、限制時間差、用 webhook-id 去重。
- 秘密不能放在前端，`VITE_` 變數會被打包進 JS。不因為在內網就信任：服務之間也要認證。
