---
title: JS 與 TypeScript 階段 6：實戰
subtitle: 第 26～28 課一頁圖解：驗證外部資料、zod、Result、branded type、狀態機、期末的型別安全訂單模組
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 26～28 課
---
型別在執行時不存在，外部資料在邊界 parse 一次。預期中的業務失敗放進回傳型別，狀態轉換在型別、執行時、資料庫三層都擋。期末專題把這些組成一個分層的訂單模組。[回 JS 與 TypeScript 學習地圖](../index.html)

## A 信任邊界：parse, don't validate {span=2}
```flow LR
[HTTP body、query、外部 API] -> [unknown]
[JSONB、環境變數、localStorage] -> [unknown]
[unknown] -> {parse 通過?}
{parse 通過?} -> *[型別精確的新物件 只含認得的欄位]: 是
{parse 通過?} -> [全部收集完一次丟出 錯誤帶路徑]: 否
```
`req.body as CreateOrderInput` 執行時什麼都不檢查。只在前端驗證不夠，API 可以被直接呼叫。錯誤帶路徑，例如 `items[1].quantity`。

## B JSON 的現實
| 程式裡 | JSON 裡 | parse 時要做的事 |
|---|---|---|
| Date | ISO 字串 | 要求時區、做往返檢查，再轉成 Date |
| bigint 的 id | 字串 | 檢查只有數字，保持字串或轉 BigInt；不能轉 Number |
| `string \| null` | null，或整個欄位不存在 | warn 兩者意義不同，PATCH 時 null 是清空 |
| number | 有時候是 `"120"` | JSON body 不自動轉型，query string 才轉 |

```callout warn 正規表示式
一定要 `^ $`；驗證用的不加 `g`；使用者輸入要跳脫；避開 `(a+)+` 這類巢狀量詞，並先限制長度，否則 ReDoS 一個請求就能卡住 event loop。
```

## C 把規則寫成資料：schema
| 迷你 schema | zod 4 |
|---|---|
| `s.object({ … })` | `z.object({ … })` |
| `s.string()`、`s.number()` | `z.string().min(1)`、`z.number().int().nonnegative()` |
| 正規表示式加往返檢查 | `z.iso.datetime({ offset: true })` |
| `Infer<typeof schema>` | `z.infer<typeof schema>` |
| 丟 ValidationError | `schema.parse(x)` 丟 ZodError |

規則與型別一份來源。NestJS 用 `ValidationPipe`（`whitelist` 剝掉未知欄位）或 `StandardSchemaValidationPipe` 加 `@Body({ schema })`；zod 的 `z.object` 剝掉、`z.strictObject` 拒絕。

## D 例外還是回傳值
| 失敗的種類 | 做法 | 例子 |
|---|---|---|
| 預期中的錯誤 | ok 回傳 `Result<T, E>` | 庫存不足、優惠碼過期、狀態不允許 |
| 程式錯誤（bug） | warn 丟例外，到邊界記 log、修程式 | 讀 undefined 的屬性 |
| 基礎設施故障 | warn 丟例外，邊界回 500 或重試 | 資料庫斷線、外部 API 逾時 |

錯誤寫成帶 `type` 的可辨識聯合，用 `switch` 加 `assertNever` 窮舉，不用字串。`ok()` 回傳 `Result<T, never>`、`err()` 回傳 `Result<never, E>`。同一種失敗不要有時 throw、有時回傳 err。

## E 狀態機：訂單狀態怎麼變 {span=2}
```flow LR
(pending) -> paid: 付款
paid -> *done: 完成
(pending) -> cancelled: 取消
paid -> cancelled: 取消並退款
```
允許的轉換寫成 `as const satisfies` 的資料，再推導出 `NextStatus<S>`；done → cancelled 沒有這條箭頭。

| 哪一層 | 擋住什麼 |
|---|---|
| 型別 | 程式裡已知狀態的非法轉換 |
| 執行時查表 | 從資料庫、請求進來的狀態 |
| 資料庫條件式 UPDATE | 兩個請求同時改同一筆，影響 0 列回 409 |

## F 品牌型別與取捨
- `number & { readonly [brand]: 'OrderId' }`，用 unique symbol 當鍵，區分意義不同的 number；執行時零成本。
- 只透過會驗證的 smart constructor 產生，`as` 只出現在那裡。
- 每個狀態一個型別、帶自己的資料，不用一堆可選欄位；檢查完回傳更精確的型別，不回傳 boolean。

| 技巧 | 值得用在 |
|---|---|
| Result | 呼叫者要依錯誤種類做不同處理的業務失敗 |
| branded type | ID、金額、已驗證的字串 |
| 每個狀態一個型別 | 訂單、付款、退款 |

在模組邊界轉換：資料庫的列 → 領域型別 → DTO。

## G 期末專題：分層與規則放哪裡 {span=2}
```flow LR
(HTTP 請求) -> [handler 驗證輸入 重複送出 轉狀態碼]
[handler 驗證輸入 重複送出 轉狀態碼] -> [service 下單 付款 完成 取消]: 回傳 Result
[service 下單 付款 完成 取消] -> [(repository 存取都用複本)]: 換資料庫只換這裡
```
| 規則 | 在哪裡檢查 |
|---|---|
| 數量 1～20、最多 10 個品項、商品不重複 | 輸入驗證：只看輸入就能判斷 |
| 商品存在、上架、庫存足夠 | 業務邏輯：要查目前的資料 |
| 單價、會員 85 折、整張最後四捨五入一次 | 業務邏輯 |
| 狀態怎麼變、取消加回庫存 | 轉換表加業務邏輯；先轉換成功才加回庫存 |
| 重複送出、取消、逾時 | 呼叫下單的那一層 |

多步驟修改先全部檢查再改；明細記下當下的單價。依賴從建構子傳進來，測試時換成假的。

## H 期末專題：非同步與對外回應
- 同一個 cartId 處理中再呼叫拿到同一個 Promise（single-flight），結束後清掉；共用的工作只看第一個呼叫者的 signal。
- 先 `await delay(signal)`，被取消或逾時不能建立訂單。
- 記憶體裡的 Map 只在一個程序有效，跨伺服器要冪等鍵存進 UNIQUE 欄位。

| 結果 | 狀態碼 |
|---|---|
| 成功 | 201 |
| `invalid_input` | 400 |
| `not_found`、`order_not_found` | 404 |
| `unavailable`、`out_of_stock`、`invalid_transition` | 409 |

用 `switch` 對應、default 交給 `assertNever`；Pick 不會刪欄位，回應用白名單組新物件。
