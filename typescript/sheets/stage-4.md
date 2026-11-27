---
title: JS 與 TypeScript 階段 4：函式、泛型與型別運算
subtitle: 第 18～22 課一頁圖解：函式的型別、泛型、從值推導型別、工具型別、mapped／conditional／infer／template literal
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 18～22 課
---
同一份資訊只寫一次：泛型把輸入和輸出連起來，型別從值推導，DTO 從模型推導。方向永遠是值 → 型別；型別運算寫得越複雜，越要寫型別測試並克制使用。[回 JS 與 TypeScript 學習地圖](../index.html)

## A 函式的型別
- 函式型別寫成 `(p: Product) => boolean`，不要用 `Function`；callback 的參數靠情境推論。
- 可選參數放最後；參數多或有布林值時改用選項物件，解構時記得 `= {}`。
- this 參數讓「this 不對」在編譯時報 TS2684；class 方法沒寫 this 參數時抓不到。

| 回傳型別 | 意思 |
|---|---|
| `void` | 呼叫者不該使用回傳值；放進來的函式回傳什麼都被忽略，包括 Promise |
| `never` | 不會正常結束：一定丟錯，或永遠不停 |
| `Promise<T>` | async 函式一律回傳，await 之後拿到 T |

## B 什麼樣的函式可以放進去
| 放進去的函式 | 可以嗎 |
|---|---|
| 參數比較少 | ok |
| 回傳值更具體 | ok |
| 參數一樣寬或更寬（逆變） | ok |
| 參數更窄 | no |
| 介面用方法寫法描述 | warn 雙變，會放過只處理一部分情況的函式 |

寫介面時用屬性寫法 `handle: (p: Payment) => string`。把 async 函式交給回傳 void 的 callback 型別檢查不會報，開 `no-misused-promises`。

```callout info overload 是最後手段
描述「不同輸入、不同輸出」；實作簽章外面看不到。回傳型別不變用聯合參數，輸入輸出型別一樣用泛型。
```

## C 泛型：把輸入和輸出連起來 {span=2}
```flow LR
[menu 是 Product 陣列] -> [first 的參數 readonly T 陣列]: T 交給推論
[first 的參數 readonly T 陣列] -> *[回傳 T 或 undefined]: 找不到時型別不說謊
```
| 寫法 | 用途 |
|---|---|
| `new Map<number, Product>()` | 空容器推不出來要自己寫；不寫是 `Map<any, any>` |
| `T extends { id: number }` | 約束：用到什麼就約束什麼，回傳仍是完整的 T |
| `Paginated<T>`、`Result<T, E = Error>` | 泛型型別 |
| `InMemoryRepository<T>` | 泛型類別，存進去和拿出來都用複本 |
| `<const T extends readonly …>` | 保留字面值與 tuple（TypeScript 5.0 起） |
| `NoInfer<T>` | 這個位置只檢查、不參與推論（TypeScript 5.4 起） |

型別參數只出現一次就不需要泛型；先寫具體的，有第二個使用情境再抽象。

## D 從值推導型別
```flow LR
[ORDER_STATUSES as const] -> [typeof 加 number 索引]
[typeof 加 number 索引] -> *[OrderStatus 聯合]
```
- 型別位置的 `typeof x` 在編譯時取得型別；運算式裡的 typeof 是執行時的字串。
- `keyof T` 是所有鍵的聯合；`<T, K extends keyof T>` 回傳 `T[K]`，型別跟著鍵走。
- 對值寫 `keyof` 報 TS2749，要寫 `keyof typeof latte`。
- `Awaited<ReturnType<typeof f>>`、`Parameters<typeof f>[0]` 從函式推導；對外的型別寫明確。
- 反過來不行：型別編譯後消失，執行時也需要的東西從值出發。

## E 用 satisfies 檢查形狀，但不放寬
| 寫法 | 少鍵、多鍵會報錯 | 值保留字面值 | keyof |
|---|---|---|---|
| `: Record<string, V>` | no | no | string |
| `: Record<Size, V>` | ok | no | Size |
| `satisfies Record<Size, V>` | ok | no 照一般推論 | Size |
| `as const satisfies Record<Size, V>` | ok | ok 而且唯讀 | Size |

## F 工具型別推導 API 的 DTO {span=2}
| API | DTO | 推導方式 |
|---|---|---|
| POST /products | `CreateProductInput` | `Omit<Product, 'id'>` |
| PATCH /products/:id | `UpdateProductInput` | `Partial<CreateProductInput>` |
| GET /products | `ProductListItem` | `Pick<Product, 'id' \| 'name' \| 'price'>` |
| 查詢參數 `?page=2` | 補上預設值的 `OrderQuery` | `Required<OrderQuery>` |

- Partial、Required、Readonly 只作用一層；Pick、Omit 保留原本的 readonly 與 `?`。
- Pick 會檢查鍵，Omit、Extract、Exclude 不會：打錯字等於什麼都沒去掉。
- 聯合用 Exclude、Extract、NonNullable；Extract 物件聯合時條件寫成物件的形狀。
- NestJS 有產生 class 的 `PartialType`、`PickType`、`OmitType`。

```callout warn 型別擋不住執行時多出來的欄位
`return row`、`{ ...row }` 型別都相容，執行時卻把成本價、內部備註送給前端。對外回應用 Pick 白名單，並在執行時一個欄位一個欄位挑出來。
```

## G 型別運算的零件 {span=3}
| 零件 | 寫法 | 要小心 |
|---|---|---|
| mapped type | `{ [K in keyof T]: … }`；`-?`、`-readonly` 拿掉修飾子 | ok 原本的 `?`、readonly 會保留 |
| 改鍵名、過濾鍵 | `as` 對應到 never 就去掉那個鍵 | warn 寫在值的位置只是值變 never |
| conditional type | `T extends U ? X : Y` | warn 遇到聯合會分配；`[T] extends [U]` 關掉 |
| infer | 比對成功時取出一塊型別 | warn 寫 `readonly (infer E)[]` 才接得住 readonly 陣列 |
| template literal | 展開組合，搭配 infer 拆字串、從路由推出參數 | warn 鍵要寫 `Capitalize<string & K>` |
| 遞迴型別 | 例如 Date 經過 JSON 之後 | no 沒有終止條件報 TS2589；特別處理的寫在 `T extends object` 前面 |

用 `Expect<Equal<…>>` 測結果，用 `@ts-expect-error` 測該報錯的有報錯。應用程式碼裡超過三層就拆成有名字的型別，或改成手寫的介面。
