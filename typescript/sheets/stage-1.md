---
title: JS 與 TypeScript 階段 1：JavaScript 的核心機制
subtitle: 第 1～6 課一頁圖解：閉包與 this、值與參考、原型與 class、錯誤處理、數字與金額、日期與文字
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 1～6 課
---
變數看出生地、this 看呼叫方式、物件變數存的是參考；錯誤要丟 Error 並保留 cause，金額用整數算，時間存 UTC、顯示時才換時區。[回 JS 與 TypeScript 學習地圖](../index.html)

## A 函式記得什麼：閉包與 this {span=2}
```flow LR
[makeStampCard 呼叫一次] -> [新的 points]: 每次一份
[新的 points] -> [stamp 函式]: 帶在背包裡
[stamp 函式] -> *[外層執行完 points 仍在]: 記的是變數，不是當下的值
```
| 呼叫方式 | this 是 |
|---|---|
| `cart.count()` | ok 點號前面的 `cart` |
| `count()` | no 嚴格模式下是 `undefined` |
| `setTimeout(cart.count, 10)` | no 交出去的只是函式，由呼叫的人決定 |
| `new Cart()` | ok 剛建立的新物件 |
| `call(other)`、`bind(other)` | ok 你指定的 `other`；`call` 立刻呼叫，`bind` 回傳新函式 |
| 箭頭函式 | warn 沒有自己的 this，用出生地外層的 this |

方法交出去會丟失 this：用箭頭函式包一層、`bind`，或寫成 class 欄位的箭頭函式。迴圈加 `setTimeout` 用 `let`，不用 `var`。物件方法不要寫成箭頭函式。

## B 指定與傳參數：複製值還是參考
| 寫法 | 複製了什麼 | 注意 |
|---|---|---|
| `let b = a`（原始值） | ok 值本身 | 改 b 不影響 a |
| `const same = cart`、傳參數 | warn 參考 | 兩邊看到同一個物件 |
| `{ ...order }`、`Object.assign` | warn 只有第一層 | 巢狀的陣列還是共用 |
| `structuredClone(x)` | ok 整棵 | 不能複製函式；class 實例變回普通物件 |
| `JSON.parse(JSON.stringify(x))` | no 會遺失型別 | Date 變字串、undefined 欄位消失、Map／Set 變 `{}`、BigInt 丟錯 |

不可變更新只複製有變的那條路，其他沿用（結構共享），就能用 `===` 判斷有沒有變。`const` 不等於不可變，`Object.freeze` 只凍一層。

## C 比較、去重與查詢
- 一律用 `===`，只有 `x == null` 例外；`NaN` 用 `Number.isNaN`。
- 物件的 `===` 比的是「是不是同一個」，不是內容。
- Map、Set、`includes` 用 SameValueZero：物件看參考，依內容去重要自己選鍵（例如 id）。
- 迴圈裡對另一個大陣列 `find` 是 O(n²)；先建 Map 索引變 O(n)。
- 會改原陣列：`sort`、`reverse`、`splice`、`push`；回傳新陣列：`toSorted`、`toReversed`、`toSpliced`、`with`。數字排序要給 `(a, b) => a - b`。
- 模組層級的 Map 快取只進不出，記憶體會一直長大：設上限或過期時間，或用 WeakMap。

## D 原型鏈與 class {span=2}
```flow LR
[latte 實例] -> [Coffee.prototype]: 自己沒有就往上找
[Coffee.prototype] -> [Drink.prototype]
[Drink.prototype] -> [Object.prototype]
[Object.prototype] -> (null)
```
| 寫法 | 放在哪裡 | 份數 |
|---|---|---|
| 方法、getter | `Cart.prototype` | 全部實例共用一份 |
| 類別欄位、箭頭函式欄位 | 每個實例身上 | 每個實例一份 |
| `static` | class 本身 | 一份 |
| `#points` | 執行時真正拿不到 | ok 私有 |
| TypeScript 的 `private` | 執行時是普通屬性 | warn 只在編譯時檢查 |

只有讀會往上找，寫一律寫在物件自己身上。子類別建構子先 `super()` 才能用 this，`super.method()` 重用父類別，`instanceof` 檢查原型鏈；只有「是一種」才繼承，其他用組合。class 有暫時性死區，宣告之前用會丟 ReferenceError。

```callout warn 原型污染
合併使用者送來的物件時跳過 `__proto__`、`constructor`、`prototype`，最好只取預期的欄位；字典用 Map 或 `Object.create(null)`。
```

## E 錯誤在哪一層處理
| 這一層的情況 | 做法 |
|---|---|
| 能補救 | ok catch，處理掉 |
| 只能補充脈絡 | warn 包一層、帶 `{ cause: e }`、再丟 |
| 不能處理 | no 不要 catch，讓它往上 |
| 邊界（API handler、按鈕事件、排程工作最外層） | ok 統一轉成回應或畫面訊息，並記 log |

- throw 沿著呼叫堆疊往上找最近的 catch；丟 Error 物件，有 name、message、stack。
- 自訂錯誤 `extends Error`、設定 name，用 `instanceof` 分辨，不比對 message。
- finally 只放清理，不要在裡面 return；先檢查、再修改。
- `JSON.stringify(err)` 只得到 `{}`，自己挑出 name、message、stack 與 cause。
- 預期中的失敗（庫存不足）回給使用者；bug 讓它往上到邊界，告警並修程式。

## F 數字與金額
```callout err 0.1 + 0.2 不是 0.3
number 是二進位浮點數，0.1 存不精確；安全範圍內的整數加減乘是精確的。`toFixed` 回傳字串，`(1.005).toFixed(2)` 是 `'1.00'`。
```
- 金額用最小單位的整數，折扣用整數百分比，乘除完只在一處 `Math.round`，捨入規則要寫下來。
- 這課的示範：拿鐵、卡布奇諾、可頌打 85 折，每行先捨入得 248，整張最後捨入得 247。
- 分攤用最大餘數法：先捨去，零頭依餘數由大到小一元一元分，加總不變。
- 先用有 `^`、`$` 的正規表示式檢查格式再轉換；`Number('')` 是 0。
- 超過 `Number.MAX_SAFE_INTEGER` 會失真：pg 把 bigint、numeric 回傳成字串，要運算用 BigInt，它不能跟 number 混算，也不能直接 `JSON.stringify`。
- 顯示用 `Intl.NumberFormat`，只在最後一步。

## G 日期與文字 {span=2}
```flow LR
[存 UTC] -> [傳 ISO 字串] -> *[顯示時才換時區]: Intl.DateTimeFormat 的 timeZone
```
| 字串 | 當成 |
|---|---|
| `'2026-10-31'` | warn UTC 的午夜 |
| `'2026-10-31T08:00:00'` | warn 執行環境時區的 8 點 |
| `'…Z'`、`'…+08:00'` | ok 寫明的時區 |

- Date 只存一個 epoch 毫秒，而且是可變物件；不存在的日期會溢位，要用往返檢查擋。
- 夏令時間讓時差不是固定值，只傳時區名稱給 Intl。
- 生日、到期日保持 `'YYYY-MM-DD'`；加月份要決定月底規則，計算只用 `Date.UTC` 和 `getUTC*`。
- Temporal 把這些分成不同型別、不可變；Chrome 已支援、本課程後端用的 Node 24 還沒有，後端目前用 Date 加 Intl。
- 字串的 `length` 是 UTF-16 code unit；字數用 `Intl.Segmenter`，比較前 `normalize()`，中文排序用 `Intl.Collator`。
