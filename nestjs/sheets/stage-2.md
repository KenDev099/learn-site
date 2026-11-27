---
title: NestJS 階段 2：請求管線與測試
subtitle: 第 6～11 課一頁圖解：middleware、guard、pipe、filter、interceptor、E2E、設定
cols: 3
theme: shadcn
課程: NestJS 第 6～11 課
---
一個請求從進來到回應要過好幾站，每一站只回答一個問題。知道每站的位置，就知道錯誤要在哪裡接、測試要在哪一層寫。[回 NestJS 學習地圖](../index.html)

## A 請求生命週期 {span=3}
```flow LR
(請求) -> middleware: 路由比對前
middleware -> guard: 能不能進來
guard -> [interceptor 進]: 計時、逾時
[interceptor 進] -> pipe: 轉換與驗證
pipe -> *handler
handler -> [interceptor 出]: 回應轉換
[interceptor 出] -> (回應)
middleware & guard & pipe & handler --> [exception filter]: 任何一站丟例外
[exception filter] --> (回應)
```
同一種元件依「全域 → controller → 路由」的順序執行；interceptor 出來時反過來。interceptor 丟的例外也交給 exception filter。

## B 每一站回答什麼
| 站 | 問題 | 看得到什麼 | 失敗回什麼 |
|---|---|---|---|
| middleware | 要不要加 request id、存取 log | req、res；看不到 handler | 丟出的例外只有全域 filter 接得到 |
| guard | 能不能進來（登入、權限、限流） | ExecutionContext、Reflector 標記 | 沒帶憑證 401，沒權限 403 |
| pipe | 參數格式對不對 | 單一參數 | 400，handler 不執行 |
| interceptor | 進出要包什麼 | `next.handle()` 的 Observable | 只把 TimeoutError 轉成 503 TIMEOUT |
| exception filter | 這個錯誤回什麼 | 例外與 host | 依 code 對照狀態碼 |

## C 錯誤回應是契約
```kv cols=1
statusCode: 400／404／409／422 分清楚，500 是自己的 bug，502／503／504 是上游或暫時性問題
error: 狀態碼的名稱
errorCode: 前端依這個判斷，不比對 message
message: 給人看的說明
details: 選填，前端顯示需要的補充資料
requestId: 跟 log 對起來
```
```callout warn 500 的規則
HttpException 保留原狀；其他例外一律 500 固定訊息，堆疊與 request id 只進 log。HttpException 的 cause 不會送出，要自己記進 log。
```

## D 驗證：DTO 與 ValidationPipe
- DTO 是 class，用 class-validator 寫規則；全域 `APP_PIPE` 開 `whitelist`、`forbidNonWhitelisted`、`transform`，v12 的 `errorFormat: 'grouped'` 讓前端依欄位顯示錯誤。
- 巢狀陣列要 `@ValidateNested({ each: true })` 加 `@Type()`；查詢參數用 `@Type(() => Number)`。
- 更新用 `PartialType`，`skipNullProperties: false` 讓「沒傳＝不改、傳 null＝400」。
- 在邊界驗證、裡面信任；驗證只管格式，業務規則與權限在 service 和 guard。

## E 測試分三層
| 層 | 測什麼 | 依賴 | 速度 |
|---|---|---|---|
| 單元 | 一小塊邏輯 | 全部換成替身 | 幾毫秒 |
| 整合 | 跟資料庫的接合 | 真的 PostgreSQL | 幾十到幾百毫秒 |
| E2E | HTTP 契約 | `createNestApplication` + supertest | 每次啟動應用幾十到幾百毫秒 |

挑最便宜又最穩的那一層測每個 bug。測試不執行 main.ts，只能設在 app 上的收進 `configureApp(app)`；最後 `app.close()`。斷言契約（狀態碼、errorCode、關鍵欄位），不做整個 body 的快照。flaky 來源：時間、時區、共用狀態、亂數、忘了 await、真的網路。

## F 設定：啟動時一次驗完 {span=2}
```flow LR
[系統環境變數] & [.env] -> ConfigModule.forRoot: 系統變數優先
ConfigModule.forRoot -> {zod schema 通過?}
{zod schema 通過?} -> *[ConfigService<Env, true>]: 是，加 { infer: true } 讀有型別的值
{zod schema 通過?} -> [列出所有錯誤，不啟動]: 否
ConfigModule.forRoot -> [功能模組]: registerAs 命名空間，注入 KEY
```
@nestjs/config 12 的 `validationSchema` 接受 zod 等 Standard Schema。數字用 `z.coerce.number()`、布林用 `z.stringbool()`。
```callout ok secret 的五條規則
`.env` 不進 git、提供 `.env.example`、正式環境由平台注入、不印進 log、外流就撤銷換新。
```
