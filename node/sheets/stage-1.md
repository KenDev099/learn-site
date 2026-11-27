---
title: Node.js 階段 1：Node 與開發環境
subtitle: 第 1～6 課一頁圖解：執行環境、程序與設定、npm、模組、TypeScript、測試與除錯
cols: 3
theme: shadcn
課程: Node.js 第 1～6 課
---
Node 是讓 JavaScript 在電腦上執行的環境。程式透過參數、環境變數、stdout／stderr 和結束碼跟外界溝通；套件版本鎖在 lockfile，型別交給 tsc 檢查，行為用 node:test 檢查。[回 Node.js 學習地圖](../index.html)

## A Node 是什麼 {span=2}
```flow LR
[你的 JavaScript] -> V8: 編譯成機器碼執行
[你的 JavaScript] -> [內建模組 node:fs、node:http]
[內建模組 node:fs、node:http] -> *libuv: 檔案、網路、計時器
```
Node 不是新語言，也不是框架。瀏覽器用同一個 V8，外面給 DOM 和 `fetch`；Node 給檔案、網路、程序，`process`、`Buffer` 是 Node 專屬的全域物件。

| 工作 | Node 適不適合 |
|---|---|
| 等資料庫、等別的服務、等檔案 | ok 一條執行緒加非阻塞 I/O，同時等上千個請求 |
| 長時間 CPU 運算（壓縮大檔、算報表） | no 佔住唯一的執行緒，所有請求一起卡住 |

正式環境只用 LTS；查文件看對應版本，只依賴 Stability 2 的 API。

## B 程序的輸入與輸出
```flow LR
(父程序) -> [process.argv]: 參數
(父程序) -> [process.env]: 環境變數
(父程序) -> [stdin]
[stdin] -> *程式
[process.argv] -> *程式
[process.env] -> *程式
*程式 -> [stdout]: 結果
*程式 -> [stderr]: 訊息
*程式 -> [結束碼]: 交回父程序
```
- 參數用 `util.parseArgs`；strict 模式對打錯的選項丟錯誤，要接住並印用法。值都是字串，自己驗證再轉型。
- 環境變數的值是字串或 undefined；`--env-file`／`process.loadEnvFile()` 讀 .env，真正的環境變數優先，.env 不進 git。
- 設定在啟動時集中驗證，一次報完所有問題，不印出機密。

## C 結束碼
| 結束碼 | 意思 |
|---|---|
| 0 | 成功 |
| 1 | 一般錯誤；沒被接住的例外也是 1 |
| 2 | 慣例：用法錯誤 |
| 128＋訊號編號 | 被訊號終止；SIGTERM 是 15，shell 顯示 143 |

```callout warn 用 process.exitCode，不要用 process.exit()
stdout 接到管線時是非同步寫入，`process.exit()` 會把還在排隊的資料丟掉；`process.exitCode = 1` 等該寫的寫完才結束。CI、排程只看結束碼判斷成敗，錯誤時以 0 結束等於回報一切正常。
```

## D 套件：npm 範圍、lockfile 與供應鏈
| 範圍 | 等於 |
|---|---|
| `^1.2.3` | `>=1.2.3 <2.0.0`，不換 MAJOR |
| `~1.2.3` | `>=1.2.3 <1.3.0`，不換 MINOR |
| `^0.2.3` | `>=0.2.3 <0.3.0`，0.x 時 ^ 更保守 |

| | `npm install` | `npm ci` |
|---|---|---|
| 用途 | 開發時加套件、改版本 | CI、部署、乾淨安裝 |
| lockfile | 需要時會更新 | 照它裝，不一致直接失敗 |

lockfile 記下整棵樹的版本和 integrity，要進 git。執行時要的放 dependencies，開發時要的放 devDependencies。安裝套件就是執行別人的程式：用 allowScripts 或 ignore-scripts、min-release-age，看清楚名稱；先找 Node 內建的功能。正式環境直接 `node server.ts`（`node --run` 不把 SIGTERM 轉給程式）；npx 在 CI 會自動下載，工具裝成 devDependency 或用 `npx --no`。

## E 這個檔案是哪一種模組
```flow TB
(看副檔名) -> [ES module]: .mjs／.mts
(看副檔名) -> [CommonJS]: .cjs／.cts
(看副檔名) -> {最近的 package.json 的 type}: .js／.ts
{最近的 package.json 的 type} -> [ES module]: module
{最近的 package.json 的 type} -> [CommonJS]: commonjs
{最近的 package.json 的 type} -> [先試 CJS 再試 ESM]: 沒寫，會印警告
```
永遠寫上 type。ES module 的相對路徑寫副檔名，用 `import.meta.dirname`，JSON 加 `with { type: 'json' }`，可以 top-level await。引入 CommonJS 時 default 一定拿得到，named import 是猜的；CommonJS 可以 require 沒有 top-level await 的 ES module。

套件從檔案所在的資料夾往上找 node_modules；`exports` 決定能 import 哪些路徑，`imports` 給專案內部取 `#` 別名。模組只執行一次，非同步的單例要快取 Promise，失敗時清掉快取。

## F Node 直接執行 .ts
| 語法 | Node 直接執行 |
|---|---|
| 型別註記、interface、type、泛型、`as`、`satisfies` | ok 擦掉型別 |
| `enum` | no 改成 `as const` 物件＋同名聯合型別 |
| parameter properties | no 改成明確宣告欄位 |
| 角括號斷言 `<number>value` | no 改用 `as` |
| 裝飾器 | no 要用 tsc、swc 建置 |

type stripping 把型別換成空白，不檢查型別、不讀 tsconfig，行號不變。直接執行的專案 import 寫 `.ts`，編譯成 .js 的專案寫 `.js`；只用到型別的 import 寫 `import type`。型別檢查交給 tsc：`noEmit`、`allowImportingTsExtensions`、`erasableSyntaxOnly`、`verbatimModuleSyntax`、`strict`、`types: ["node"]`。

## G 測試與除錯 {span=2}
```flow LR
[node --test 檔名] -> {斷言全部成立?}
{斷言全部成立?} -> *通過: 結束碼 0
{斷言全部成立?} -> 失敗: 結束碼 1
失敗 -> [讀 stack trace]
[讀 stack trace] -> [node --inspect-brk]: 要看當時變數的值
```
- 斷言從 `node:assert/strict` 引入；舊版 `node:assert` 裡 equal 是寬鬆的 ==。
- 好的測試在程式壞掉時會失敗：一個測試一個行為，準備／執行／檢查三段，測邊界，先看到它失敗。
- async 測試要 await；要求失敗用 `assert.throws`／`await assert.rejects`，不要只在 catch 裡斷言。
- 變異測試用改壞的版本檢驗測試本身，比「全部通過」和覆蓋率更能說明測試有沒有用。
- stack trace 先看錯誤類型和訊息，找第一個自己的檔案，再順著資料往前追；`[cause]` 是底層的原因。
- 除錯器搭配 chrome://inspect 或 VS Code 的 JavaScript Debug Terminal；inspector 只開在 127.0.0.1。
