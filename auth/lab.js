// 認證、權限與資安 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'auth-progress'
export const STAGES = [
  ['階段 1：地基：身分、信任與密碼學工具', [
    [1, '認證與授權：誰在用、能做什麼', '01-authn-authz.html'],
    [2, '密碼學工具箱：編碼、雜湊、HMAC 與安全亂數', '02-crypto-toolbox.html'],
    [3, '密碼怎麼存：salt、慢雜湊與密碼政策', '03-password-storage.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：瀏覽器裡的登入狀態：Cookie、Session 與跨站攻擊', [
    [4, 'Cookie 與 Session：伺服器怎麼記住你', '04-cookies-sessions.html'],
    [5, '同源政策與 CORS：誰可以讀回應', '05-same-origin-cors.html'],
    [6, 'CSRF：借你的 Cookie 發請求', '06-csrf.html'],
    [7, 'XSS 與 CSP：前端漏洞怎麼變成帳號被盜', '07-xss-csp.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：Token 與 JWT', [
    [8, 'Token 與 JWT：結構、簽章與公鑰', '08-jwt-signatures.html'],
    [9, '驗證 JWT：每個欄位都要檢查', '09-jwt-verification.html'],
    [10, 'Access token 與 refresh token：輪替與重用偵測', '10-refresh-rotation.html'],
    [11, '登出與撤銷：session 與 JWT 怎麼選', '11-revocation-tradeoffs.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：更多登入方式：第三方、多因素與機器', [
    [12, 'OAuth 2.0：授權碼流程與 PKCE', '12-oauth-pkce.html'],
    [13, 'OpenID Connect：用 Google、LINE 登入', '13-openid-connect.html'],
    [14, '多因素認證：TOTP 與復原碼', '14-mfa-totp.html'],
    [15, 'Passkey：用公鑰取代密碼', '15-passkeys.html'],
    [16, '帳號流程：驗證信、重設密碼與防暴力破解', '16-account-flows.html'],
    [17, '機器對機器：API key、client credentials 與 webhook 簽章', '17-api-keys-m2m.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：授權：能做什麼、能看哪些資料', [
    [18, 'RBAC：角色與權限', '18-rbac.html'],
    [19, '物件與欄位層級授權：BOLA、BOPLA 與 ABAC', '19-object-level-authz.html'],
    [20, '多租戶隔離', '20-multi-tenancy.html'],
    [21, '在 NestJS 實作認證與授權', '21-nestjs-auth.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：資深工程師的資安實務', [
    [22, 'SSRF 與呼叫外部服務', '22-ssrf.html'],
    [23, 'Secrets 管理與資料加密', '23-secrets-encryption.html'],
    [24, 'OWASP API Security Top 10（2023）總整理', '24-owasp-api-top10.html'],
    [25, '威脅建模、稽核紀錄與事故應變', '25-threat-modeling.html'],
    [26, '期末專題：咖啡店 API 安全強化', '26-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
