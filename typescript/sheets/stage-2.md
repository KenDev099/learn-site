---
title: JS 與 TypeScript 階段 2：非同步、迭代與並發
subtitle: 第 7～12 課一頁圖解：event loop、Promise、async/await、迭代器與產生器、逾時與取消、競態與並發控制
cols: 3
theme: shadcn
課程: JS 與 TypeScript 第 7～12 課
---
JavaScript 只有一條執行緒，等待交給宿主環境；先後順序靠「等前一步完成」，不靠「等一段時間」。Promise 不能取消，要停就傳 AbortSignal；每個 await 都是插隊點。[回 JS 與 TypeScript 學習地圖](../index.html)

## A Event loop：誰先誰後 {span=2}
```flow LR
(執行一個 task) -> [清空所有 microtask]: 途中新排的也一起清
[清空所有 microtask] -> [下一個 task]
[下一個 task] --> (執行一個 task)
```
| 佇列 | 放什麼 |
|---|---|
| task | `setTimeout`、事件、訊息 |
| microtask | `then`／`catch`／`finally`、await 之後的程式、`queueMicrotask` |

這課的示範：`console.log('A')`、`setTimeout(B, 0)`、`.then(C)`、`queueMicrotask(D)`、`console.log('E')` 印出 A E C D B。

```callout warn 包成 Promise 不會變成背景執行
executor 和第一個 await 之前的程式都同步執行，重的計算照樣卡住執行緒。長工作一批一批做，中間用 `setTimeout` 讓出；用 microtask 讓出沒有用，每一筆都讓出又太慢。
```

## B Promise 鏈怎麼傳值
| then 的 callback 裡 | then 回傳的新 Promise |
|---|---|
| return 值 | ok 用這個值成功 |
| return 另一個 Promise | ok 等它定案，同一個結果 |
| 沒有 return | no 用 undefined 成功，不等裡面的工作 |
| throw 錯誤 | warn 用這個錯誤失敗 |

- pending → fulfilled 或 rejected，只定案一次；executor 立刻同步執行。
- 錯誤跳到最近的 catch，catch 之後鏈恢復成功；finally 不改變結果。
- `setTimeout(resolve(x), ms)` 立刻呼叫了 resolve，要交出 `() => resolve(x)`。
- 一律 `reject(new Error(…))`，不 reject 字串。
- callback 風格的 API 用 new Promise 包起來（promisify）；`Promise.withResolvers()`（ES2024）讓 executor 外面的程式決定結果。

## C 同時等很多個
| 組合函式 | 結果 | 適合 |
|---|---|---|
| `Promise.all` | 全部成功給陣列；一個失敗就失敗 | 缺一不可 |
| `Promise.allSettled` | 全部定案，永遠不會失敗 | 部分失敗也要顯示 |
| `Promise.race` | 第一個定案的，不管成敗 | 誰先回來就用誰 |
| `Promise.any` | 第一個成功的；全部失敗是 AggregateError | 有一個成功就好 |

```callout warn 都不會取消其他工作
其他工作照樣跑完，扣款、寄信這類副作用照樣發生。
```

## D 依序、同時或最多 N 個：async/await
| 排法 | 什麼時候用 | 代價 |
|---|---|---|
| 依序 | 後一步需要前一步的結果、順序有意義 | 總時間相加 |
| 全部同時 `Promise.all` | 互不相依、數量小而且固定 | 數量一大，同時打出去的請求也一樣多 |
| 最多 N 個（工作池） | 數量大或不固定 | 要自己寫或用套件；比分批快，不用等每批最慢的 |

- async 函式一定回傳 Promise；await 只暫停目前這個函式。
- `forEach(async …)` 不會等；依序用 `for…of` 加 await。
- try 裡寫 `return await`：catch 接得到、finally 時機正確、stack trace 保留呼叫者。
- 射後不理也要 `.catch`；`no-floating-promises` 會抓，`void` 不算處理。

## E 迭代器與產生器：一次拿一筆
```flow LR
[for…of] -> [Symbol.iterator]: 拿到迭代器
[Symbol.iterator] -> [next]: 每次給 value 與 done
[next] -> *[function* 執行到 yield 暫停]
```
| | 全部載入陣列 | 非同步產生器 |
|---|---|---|
| 記憶體 | 所有頁同時在記憶體 | 只有目前這一頁 |
| 第一筆開始處理 | 等全部頁面抓完 | 第一頁回來就開始 |
| 找到就停 | no 後面的頁已經抓了 | ok 沒拿就不抓 |

普通物件不是可迭代物件；自己的類別加上 `*[Symbol.iterator]()` 就能被走訪。提早 break 會呼叫 `return()`、執行 finally。`async function*` 配 `for await…of`；拉取模式天生有背壓，代價是只能走一遍。

## F 逾時與取消：AbortController {span=2}
```flow LR
[AbortController] -> [AbortSignal]: abort 發出取消
[AbortSignal.timeout] & [AbortSignal.any] -> [AbortSignal]
[AbortSignal] -> [每一層呼叫] -> *[真正在等的那一層]: 一路傳下去
```
自己的函式支援 signal 要做四件事：先檢查 `signal.aborted`、監聽 abort、取消時清理並以 `signal.reason` 失敗、完成時移除監聽器。

| e.name | 誰造成的 | 處理 |
|---|---|---|
| `AbortError` | 呼叫端自己取消 | ok 安靜結束，不顯示錯誤 |
| `TimeoutError` | 對方太慢 | warn 提示重試或回 504，要記錄 |
| 其他 | 真的出錯 | no 照第 4 課處理 |

整體期限是一個 signal 傳給每一步，不是每一步各自逾時。輪詢不用 `setInterval`，用「做完一次、等一段時間、再做下一次」的迴圈。

## G 競態：await 是插隊點
| 症狀 | 工具 | 極限 |
|---|---|---|
| 舊結果蓋掉新結果 | 請求序號加取消上一個 | 只處理同一個畫面只要最新的 |
| 先檢查再修改被插隊 | 放同一段同步程式；失敗就補償 | 資料在資料庫就用條件式 UPDATE |
| 讀和寫中間一定要 await | 依 key 排隊的鎖 | 只在一個程序裡有效 |
| 同一件事被觸發兩次 | 單一飛行，共用同一個 Promise | 後端要冪等鍵 |

debounce 只減少請求數，不保證順序。補償做反向操作，不寫回舊值。鎖和去重的 Map 失敗要清、用完要刪。多台伺服器靠資料庫的條件式 UPDATE、列鎖、advisory lock。
