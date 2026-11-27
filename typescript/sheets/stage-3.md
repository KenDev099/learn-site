---
title: JS 與 TypeScript 階段 3：型別基礎
subtitle: 第 13～17 課一頁圖解：TypeScript 在做什麼、物件型別、聯合與字面值、型別縮小、unknown 與型別守衛
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 13～17 課
---
型別只在寫程式時檢查，執行時已經擦掉。用字面值聯合與可辨識聯合讓錯的狀態寫不出來，外部資料進來時當成 unknown，檢查過再用。[回 JS 與 TypeScript 學習地圖](../index.html)

## A 兩件互不相干的事 {span=2}
```flow LR
[order.ts 程式加型別] -> [檢查型別]: 第一件
[檢查型別] -> [錯誤清單 給人看]
[order.ts 程式加型別] -> [擦掉型別]: 第二件
[擦掉型別] -> *[order.js 拿去執行]: 有型別錯誤照樣產生
```
tsc 預設遇到型別錯誤照樣輸出 JS；Vite 只轉譯、不檢查；Node 24 直接執行 .ts 也只擦掉型別。要另外跑 `tsc --noEmit` 或 `vue-tsc`。

| 代碼 | 意思 |
|---|---|
| TS2322 | 值的型別跟目標不符 |
| TS2345 | 傳進函式的參數型別不對 |
| TS2339、TS2551 | 這個型別上沒有這個屬性 |
| TS7006 | 參數沒寫型別也推不出來，變成隱含的 any |
| TS18047、TS18048 | 可能是 null／undefined，用之前要先檢查 |

## B 推論與 strict
- 自己宣告的函式，參數要寫型別；對外函式的回傳值建議寫；callback 的參數和其他大多交給推論。
- `let` 推論成寬的 `string`，`const` 保留字面值 `'M'`。
- strict 從 TypeScript 6 起預設開啟，最常擋下隱含的 any（`noImplicitAny`）和可能是 null／undefined 的值（`strictNullChecks`）。
- 讀錯誤看三樣：第幾行、訊息、代碼。

```callout warn 用 any、as、! 讓錯誤消失
錯誤不見了，執行時照樣當掉；any 還會擴散到它的屬性和回傳值。
```

## C 物件型別：? 與 | null
| 寫法 | 意思 | 用在哪裡 |
|---|---|---|
| `phone?: string` | 屬性可以不存在，讀出來含 undefined | API 輸入「可以不傳」 |
| `phone: string \| null` | 屬性一定在，值可能是 null | 資料庫的 NULL |
| `phone?: string \| null` | 沒傳＝不改，傳 null＝清掉 | 這課的 `CustomerPatch` |

- 資料表的 snake_case 欄位寫成 camelCase 屬性，主鍵加 `readonly`；readonly 只在編譯時、只有一層。
- 結構型別只看形狀、不看名字；多餘屬性檢查只抓新鮮的物件字面值。
- 索引簽章和 `Record` 讀出來的型別沒有 undefined，找不到的鍵用 `?? 0` 這類寫法處理。

## D 該用 type 還是 interface
| | type | interface |
|---|---|---|
| 描述物件 | ok | ok |
| 聯合、tuple、型別運算 | ok | no 只能描述物件 |
| 組合 | warn `&` 衝突時變成 never | ok `extends` 衝突時當場報錯 |
| 同名宣告兩次 | no 報錯 TS2300 | warn 宣告合併 |

物件型別團隊選一種保持一致。

## E 聯合與字面值型別
- `A | B` 的值是其中一種；縮小之前只能用共有的東西。
- `'pending' | 'paid' | 'done' | 'cancelled'` 在寫程式時擋下打錯的狀態；資料庫的 enum／CHECK 是第二道防線。
- `let` 和物件屬性會放寬成 string：用型別註記、`as const`，不要用 `as`。
- `?.` 安全地往下讀；`??` 只在 null／undefined 時給預設值。

| 左邊的值 | `值 \|\| '預設'` | `值 ?? '預設'` |
|---|---|---|
| `0`、`''`、`false` | no 被換成 `'預設'` | ok 保留 |
| `null`、`undefined` | `'預設'` | `'預設'` |

enum 會產生執行時物件：Node 直接執行不支援，`erasableSyntaxOnly` 報 TS1294，新程式用字面值聯合。never 是沒有任何值的型別。

## F 型別縮小與窮舉檢查 {span=2}
| 檢查 | 適合 | 要小心 |
|---|---|---|
| `typeof x === 'string'` | 原始型別、function | warn `typeof null` 是 `'object'` |
| `if (x)` | 物件或 null／undefined | no 0 和 `''` 也被擋掉 |
| `x != null` | 同時排除 null 和 undefined | ok `==`／`!=` 唯一的例外用法 |
| `'address' in x` | 形狀不同的物件 | 看的是有沒有這個鍵 |
| `instanceof` | class 實例、錯誤類別 | interface 和 type 執行時不存在 |
| `Array.isArray(x)` | 陣列或單一值 | `typeof []` 也是 `'object'` |

```flow LR
[switch 檢查標籤欄位] -> [每一種只帶自己需要的資料]
[switch 檢查標籤欄位] -> *[default 呼叫 assertNever]: 剩下的型別是 never
[default 呼叫 assertNever] --> [寫程式時 漏掉的情況在這一行報錯]
[default 呼叫 assertNever] --> [執行時 遇到意外的值丟錯]
```
可辨識聯合的標籤要是字面值型別。default 不要回傳預設值，會把新的情況悄悄吞掉。物件屬性在 callback 裡不保留縮小，先放進 `const`。

## G 外部資料：unknown、any 與型別守衛 {span=2}
```flow LR
[JSON.parse 與 res.json] -> [指定給 unknown]: 信任邊界
[指定給 unknown] -> [typeof、in、Array.isArray]: 一步一步縮小
[typeof、in、Array.isArray] -> *[檢查過再用]
```
| | 型別守衛 `x is T` | 斷言函式 `asserts x is T` |
|---|---|---|
| 不合時 | 回傳 false | 丟錯 |
| 呼叫端 | 寫在 if 裡 | 單獨一行，之後直接用 |
| 適合 | 不合也是正常情況 | 不合就是錯誤：設定檔、API 參數 |

兩者 TypeScript 都完全相信，用到的每個欄位都要檢查。strict 下 catch 的 `e` 是 unknown，用 `e instanceof Error` 取訊息。`as` 和 `!` 編譯後消失：往寬的方向轉安全，往窄的方向轉是在說謊；`as unknown as X` 是警訊。TypeScript 5.5 起，`filter(p => p !== undefined)` 會自動推論型別謂詞。
