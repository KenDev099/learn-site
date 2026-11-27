# 0003. access token＋輪替的 refresh token

## 狀態

已採用（2026-11-19）

## 背景

前端是 Vue SPA。要能撤銷登入、偵測 refresh token 被偷，同時不要每個請求查 session 表。

## 決定

access token 是 15 分鐘的 JWT（HS256，`sub`、`tid`，演算法、iss、aud 寫死）。refresh token 放 HttpOnly、SameSite=Strict、Path=/api/v1/auth 的 cookie，資料庫只存雜湊；每次使用就輪替，舊的再被用就撤銷整個家族。角色不放 token：每個請求查 membership。

## 後果

- 成員被移除或降級，下一個請求就生效，不用等 token 過期；代價是每個請求一次查詢（之後可以加短時間的快取）。
- 正式環境一定要 HTTPS（cookie 的 Secure）。
