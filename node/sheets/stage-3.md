---
title: Node.js 階段 3：檔案與位元組
subtitle: 第 10～11 課一頁圖解：fs/promises、路徑、錯誤碼、原子寫入、鎖檔、Buffer、編碼、base64url
cols: 3
theme: shadcn
課程: Node.js 第 10～11 課
---
讀寫檔案要假設會失敗、會被同時改、會寫到一半；檔案和網路傳的是位元組，長度、切段、編碼都要用位元組的角度處理。[回 Node.js 學習地圖](../index.html)

## A 用哪一種 fs、路徑從哪裡算
| 寫法 | 什麼時候用 |
|---|---|
| `node:fs/promises` | ok 預設，處理請求時一律用它 |
| `readFileSync` 等 Sync | warn 啟動時讀一次設定、命令列小工具 |
| callback | warn 舊程式，看得懂就好 |

相對路徑從工作目錄算，不是程式檔所在的資料夾。程式自己帶的檔案用 `join(import.meta.dirname, …)`；使用者給的路徑用 `resolve()` 轉成絕對路徑。

## B 直接做，失敗再看 err.code
| code | 意思 |
|---|---|
| ENOENT | 路徑上某一段不存在 |
| EACCES／EPERM | 沒有權限 |
| EISDIR／ENOTDIR | 路徑錯了 |
| EEXIST | 已經存在；`'wx'` 建檔時代表別人先建了 |
| EMFILE | 開了太多檔案，通常是開了沒關 |

只處理預期的 code，其他包成有路徑、有 `cause` 的錯誤丟出去。`open()` 回傳的 FileHandle 一定要關，`await using` 會自動關。

## C 原子寫入：暫存檔再 rename {span=2}
```flow LR
(新內容) -> [同資料夾、隨機名字的 .tmp]: writeFile
[同資料夾、隨機名字的 .tmp] -> *rename: 寫完
*rename -> [orders.json 一步換上]
[同資料夾、隨機名字的 .tmp] --> [刪掉暫存檔]: 失敗時
```
`writeFile` 會先清空再一段一段寫，別人這時讀到空檔或半份 JSON。改成原子寫入後，讀檔時只會看到完整舊檔或完整新檔；防斷電還要 fsync。

## D 同時更新同一個檔案
讀出、加一筆、寫回會遺失更新：同時讀到舊值，各自寫回。原子寫入擋不住，因為問題在讀到舊資料。

| 情況 | 做法 |
|---|---|
| 一個程序，資料量小 | 原子寫入＋程序內 Promise 鏈排隊 |
| 同一台機器幾個程序，寫入不頻繁 | 原子寫入＋鎖檔 |
| 多台機器、寫入頻繁、要查詢或交易 | 資料庫 |

```callout warn 鎖檔
用 `open(lockPath, 'wx')` 建立，已存在就拿到 EEXIST；先檢查再建立會被插隊。在 finally 放鎖，還要處理當掉留下的鎖。
```

## E 三種長度
```flow LR
[字串 拿鐵☕] -> [3 個字元]: Unicode code point
[字串 拿鐵☕] -> [length 是 3]: UTF-16 code unit
[字串 拿鐵☕] -> [Buffer.byteLength 是 9]: UTF-8 位元組
```
UTF-8：英數字 1 個位元組，常用中文 3 個，emoji 多半 4 個；`length` 裡 emoji 常佔 2 格（😀 是 2）。後端的大小限制和 Content-Length 都是位元組，用 `Buffer.byteLength()` 算；`res.end(body)` 時 Node 會自己算。

## F Buffer 與切到一半的字 {span=2}
```sequence
participants: 網路, 程式
網路 -> 程式: 第一段：拿 + 鐵的第 1 個位元組
網路 -> 程式: 第二段：鐵的後 2 個位元組
note 程式: 各自 toString：拿���，資料永久壞掉
== 正確做法 ==
程式 -> 程式: StringDecoder 或 TextDecoder 的 stream 模式
note 程式: 不完整的位元組先留著，下一段再接上
```
- Buffer 是 Uint8Array 的子類別，能在 UTF-8、hex、base64、base64url 之間轉換；`subarray` 共用記憶體，`concat` 產生新的。
- 資料不大時也可以先 `Buffer.concat` 再解碼，要配上大小上限。
- 讀二進位格式要選對位元組順序和有號／無號，先檢查長度，用 `&` 判斷旗標。

## G 編碼 cursor 與記憶體安全
- base64url 沒有 `+`、`/`、`=`，適合把分頁 cursor 放進網址，但不是加密，任何人都能解開、改內容。
- 解碼外部輸入：先檢查字元，包住 `JSON.parse`，驗證欄位型別，所有錯誤轉成同一種錯誤，API 才能統一回 400。
- 預設用 `Buffer.alloc`；`Buffer.allocUnsafe` 可能殘留之前的記憶體。
- 比較祕密值用 `crypto.timingSafeEqual`，不用 `===`。
