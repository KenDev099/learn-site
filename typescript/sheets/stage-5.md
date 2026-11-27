---
title: JS 與 TypeScript 階段 5：寫後端需要的 TypeScript
subtitle: 第 23～25 課一頁圖解：類別與存取修飾子、裝飾器與 metadata、迷你 DI、模組、.d.ts 與 tsconfig
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 23～25 課
---
class 同時是值和型別，interface 只是型別；執行時要用到的東西（DTO、DI 的鑰匙）只能是 class。NestJS 靠裝飾器把建構子參數型別留到執行時，所以要先編譯，tsconfig 的每一行都要說得出理由。[回 JS 與 TypeScript 學習地圖](../index.html)

## A 欄位初始化與存取修飾子
| 寫法 | 什麼時候用 |
|---|---|
| 給初始值 `price = 0` | ok 有合理的預設值 |
| 建構子賦值 | ok 值一定要由建立的人提供（最常見） |
| 明確賦值斷言 `price!: number` | warn 框架在建立物件後才填值 |

| | TS `private` | `#private` |
|---|---|---|
| 檢查時間 | 只在編譯時 | 執行時（語言本身） |
| `as any` 讀得到嗎 | warn 讀得到 | ok 讀不到 |
| `JSON.stringify`、`Object.keys` | warn 會出現 | ok 不會出現 |
| 能當安全機制嗎 | no | ok 擋住同一個程序裡的其他程式碼 |

NestJS starter 關掉 `strictPropertyInitialization` 是為了 DTO，不是一般做法。

## B 介面、抽象類別與參數屬性
| | interface | abstract class |
|---|---|---|
| 有實作嗎 | 沒有，只有形狀 | 可以有共用方法與欄位 |
| 執行時存在嗎 | no | ok 可以 instanceof |
| 一個 class 能用幾個 | implements 好幾個 | 只能 extends 一個 |

- implements 只檢查、不推論，參數沒寫型別就是 TS7006。
- 覆寫寫 `override`，開 `noImplicitOverride`；實作抽象成員不用。
- 參數屬性 `constructor(private products: …)` 一次宣告、接收、賦值；它會產生程式碼，`erasableSyntaxOnly` 報 TS1294，Node 直接執行丟 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`。

## C 依賴注入：從建構子傳進來
```flow LR
[OrdersService 建構子] -> [參數型別寫介面]
[參數型別寫介面] -> [正式環境 真的實作]
[參數型別寫介面] -> *[測試 換成假的實作]
```
在服務裡自己 new 依賴，測試換不掉、要換實作得改程式。共用流程才用抽象類別，其他用組合。

## D 型別怎麼留到執行時 {span=2}
```flow LR
[@Injectable 加在 class 上] -> [emitDecoratorMetadata]: 編譯時
[emitDecoratorMetadata] -> [design:paramtypes 陣列]
[design:paramtypes 陣列] -> {參數型別是什麼}
{參數型別是什麼} -> *[class 本身]: class
{參數型別是什麼} -> [Object]: interface
{參數型別是什麼} -> [Function]: import type 的 class
```
`__metadata` 只在 `Reflect.metadata` 存在時才記錄，要 `import 'reflect-metadata'`；少了它不會報錯，metadata 悄悄不見。Nest 專案由 `@nestjs/common` 載入。interface 用 Symbol token 加 `@Inject(TOKEN)`，或改成 abstract class。

```callout warn 換建置或測試工具時先問
它支不支援裝飾器 metadata？esbuild 不支援 emitDecoratorMetadata，而 Vitest 預設用 esbuild 轉譯；NestJS 文件的做法是讓 Vitest 改用 SWC（unplugin-swc）。先跑一個有注入的測試確認。
```

## E 兩套裝飾器
| | experimentalDecorators（舊版） | TC39 標準 |
|---|---|---|
| 方法裝飾器的參數 | `(target, key, descriptor)` | `(method, context)` |
| 參數裝飾器 | ok 有 | no 寫了報 TS1206 |
| emitDecoratorMetadata | ok 可以一起用 | no 不相容 |
| 誰在用 | NestJS 12、TypeORM、class-validator | 不依賴參數裝飾器的新函式庫 |

裝飾器在類別定義時執行一次；成員的先執行，類別的最後。包裝方法用 `function` 加 `original.apply(this, args)`，不用箭頭函式。

## F 迷你 DI 容器（選讀）
選讀：想知道 Nest 解析不了依賴的錯誤怎麼來再看，跳過不影響後面的課。

```flow LR
[要 OrdersService] -> [讀 metadata] -> [遞迴建立依賴] -> *[單例快取]
[遞迴建立依賴] --> [解析不了 給出清楚的錯誤]
```
forwardRef 處理循環，但循環依賴最好從設計上避免：先試著把共用邏輯抽成第三個服務。

## G 模組與 .d.ts {span=2}
| 寫法 | 編譯後 | 執行時 |
|---|---|---|
| `import type { Receipt } from 'coffee-pos'` | 整行刪掉 | ok 不會載入 |
| `import { type Receipt } from 'coffee-pos'` | `import {} from 'coffee-pos'` | warn 仍會載入 |
| `import { Receipt }`（只是型別） | 編譯錯誤 TS1484 | — |

- 要注入的 class 用一般 import，不能用 `import type`。
- `.d.ts` 和 `declare` 只有形狀、沒有實作：宣告檔描述現實，不製造現實。
- 第三方型別來自套件本身或 `@types/*`；TypeScript 6／7 的 `types` 預設 `[]`，要列出 `"node"`。
- 靠 interface 的宣告合併，`declare module` 擴充別人的模組、`declare global` 擴充全域。

## H NestJS 12 tsconfig 的幾行
```kv cols=1
module／moduleResolution nodenext: 相對匯入要寫 .js，寫的是編譯後的檔名
experimentalDecorators、emitDecoratorMetadata: 裝飾器和 DI 靠這兩個
strict 加 strictPropertyInitialization false: DI 注入與 DTO 的欄位不在建構子給值
isolatedModules: 每個檔案能單獨轉譯，讓 SWC 能用
sourceMap: 加 --enable-source-maps 讓 stack trace 對回 .ts
```
- `noUncheckedIndexedAccess` 讓索引讀取加上 undefined；`exactOptionalPropertyTypes` 分開「沒有這個鍵」和「值是 undefined」。
- TypeScript 7 是原生編譯器，但 7.0 沒有 API，Vue 工具暫時用 6.0。
- 舊專案一次開一個旗標；改不完用 `// @ts-expect-error 原因`，不用 `@ts-ignore`；CI 跑 `tsc --noEmit`。
