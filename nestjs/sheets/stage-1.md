---
title: NestJS 階段 1：從 Node 到 NestJS
subtitle: 第 1～5 課一頁圖解：骨架、Controller、依賴注入、模組、單元測試
cols: 3
theme: shadcn
課程: NestJS 第 1～5 課
---
框架掌控流程、你填空。Nest 用裝飾器登記 controller 與 provider，由容器建立物件並注入依賴，測試時就能把依賴換成替身。[回 NestJS 學習地圖](../index.html)

## A 一個請求怎麼走過骨架 {span=2}
```flow LR
(main.ts bootstrap) -> AppModule: NestFactory.create
AppModule -> Controller: 登記路由
Controller -> *Service: 注入後呼叫
Service -> [記憶體陣列]: 這個階段還沒接資料庫
Controller --> 回應: 回傳值就是 body
```
NestJS 建立在 Express 5 上，接手路由、JSON 回應、錯誤處理和物件的建立。代價：一定要編譯、要學慣例、除錯多一層；小腳本不需要它。

## B .ts 變成可執行程式的三條路
| 指令 | 型別檢查 | 結果 |
|---|---|---|
| `nest build`、`nest start` | ok tsc 會檢查 | 編譯到 dist/；正式環境 build 後跑 `node dist/main.js` |
| `npm test`（Vitest） | warn 只轉譯 | 型別錯誤也會跑 |
| `node src/main.ts` | no 只擦掉型別 | 遇到裝飾器就是語法錯誤 |

```callout warn nodenext
相對 import 要寫 `.js`：`import { X } from './x.service.js'`。`nest g` 看目前資料夾的 package.json 決定要不要加。
```

## C Controller：路由、參數與回應
- 最終路徑是 `@Controller()` 前綴加上 `@Get()` 等裝飾器的路徑。
- `@Param`、`@Query` 拿到的一律是字串，型別註記不會轉型；要數字用 `ParseIntPipe`。
- 回傳值就是回應：POST 預設 201、其他 200，用 `@HttpCode()`、`@Header()` 調整。
- 錯誤狀態丟 `HttpException` 的子類別；一般 Error 變成不洩漏細節的 500。
- Nest 照宣告順序登記路由，固定路徑寫在 `:id` 前面。
- 不用 `@Res()`；要碰回應物件就用 `passthrough: true`。

## D 依賴注入怎麼找到 provider {span=2}
```flow LR
[constructor(private svc: MenuService)] -> [design:paramtypes]: 編譯器寫入 metadata
[design:paramtypes] -> {token 是 class?}
{token 是 class?} -> 容器: 是，用 class 當 token
{token 是 class?} -> [@Inject(TOKEN)]: 不是，用 Symbol token
容器 -> *實例: 在模組的 providers 與 imports 進來的 exports 裡找
```
```callout err interface 與 import type 都會讓注入失敗
執行時 interface 不存在，`import type` 也不會留下 class，metadata 裡就不是那個 class。要描述介面又要當 token，用抽象類別。
```

## E Provider 四種寫法
| 寫法 | 給什麼 | 什麼時候用 |
|---|---|---|
| `useValue` | 一個現成的值 | 設定、常數、測試替身 |
| `useClass` | 另一個 class | 換實作，token 不變 |
| `useFactory` | 執行時算出來的值 | 依設定選實作、需要 inject 別的 provider |
| `useExisting` | 別名 | 同一個實例、兩個 token |

provider 預設 singleton：欄位等於全域狀態，請求的資料放參數與區域變數。只有一個實作的 service 不需要額外的 interface。

## F @Module 的四個欄位
```kv cols=1
providers: 這個模組建立的 service，預設只有自己看得到
controllers: 這個模組的路由
imports: 只放模組，拿到對方 exports 的東西
exports: 開放給 import 我的模組；一個 provider 只登記在一個模組
```
`Nest can't resolve dependencies of X (?)`：看問號是第幾個參數、在哪個模組找，原因多半是沒 import、沒 export 或 import type。`@Global()` 只給基礎設施。

## G 單元測試：Vitest 與 Testing Module {span=2}
```sequence
測試 -> Test.createTestingModule: providers 含被測 service
Test.createTestingModule -> 容器: 依賴用 { provide, useValue: 替身 }
容器 --> 測試: compile() 後 moduleRef.get(OrdersService)
測試 -> OrdersService: 呼叫方法
OrdersService -> 替身: mockResolvedValue 決定回傳
測試 -> 測試: expect(替身).toHaveBeenCalledWith(…)
```
| 斷言 | 比什麼 |
|---|---|
| `toBe` | 同一個值（Object.is） |
| `toEqual` | 內容相同 |
| `rejects.toThrow` | 非同步丟錯，一定要 `await` |

正式模組裡換掉一個 provider 用 `overrideProvider`，`useMocker` 一次補齊所有依賴；純函式直接呼叫。時間做成 provider（`CLOCK`）或用 `vi.setSystemTime`；好測試測邊界、錯誤路徑、空值，預期值寫死，先看到紅燈再相信綠燈。
