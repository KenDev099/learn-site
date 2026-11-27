---
title: HTML 與 CSS 階段 1：HTML 與可操作的網頁
subtitle: 第 1～5 課一頁圖解：DOM 與 head、語意化 HTML、表格與替代文字、原生表單、無障礙
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 1～5 課
---
CSS、JavaScript 和輔助科技讀的都是瀏覽器建出來的樹，不是原始碼。元素選對，角色、名稱、狀態與鍵盤行為就自動正確；ARIA 只補原生做不到的部分。[回 HTML 與 CSS 學習地圖](../index.html)

## A 從原始碼到兩棵樹 {span=2}
```flow LR
(HTML 位元組) -> tokens -> *DOM
*DOM -> [render tree]: 跟 CSSOM 合起來
CSS -> CSSOM -> [render tree]
[render tree] -> [排版、繪製]
*DOM -> [無障礙樹]: 角色、名稱、狀態
[無障礙樹] -> [螢幕閱讀器、語音控制、自動化測試]
```
瀏覽器邊下載邊解析。結構寫錯時解析器會照規範修正，DOM 就跟原始碼不同：p 裡放 div 會被拆開、table 會補上 tbody、a 不能包 a。CSS 選擇器和 JavaScript 照 DOM 走，畫面怪怪的先看 Elements 面板裡的 DOM。

## B 文件骨架每一行的用途
```kv cols=1
doctype: 用標準模式排版；少了進入怪異模式
lang="zh-Hant": 影響發音、選字型、斷行
meta charset: 放 head 第一個，中文才不會亂碼
viewport: 手機用裝置寬度排版；不要禁止縮放
title: 主題在前、品牌在後，例如「菜單｜豆留咖啡」
```
head 裡的 CSS 阻擋渲染。瀏覽器照 `Content-Type` 處理資源，不看副檔名；檔名帶 hash 的檔案才能長期快取，`index.html` 不能。

## C Script 什麼時候執行
| 寫法 | 下載 | 執行時機與順序 |
|---|---|---|
| 沒加屬性 | no 擋住解析 | 下載完立刻，文件順序 |
| `defer` | ok 跟解析同時 | 解析完、`DOMContentLoaded` 前，文件順序 |
| `async` | ok 跟解析同時 | warn 下載完就插隊，順序不保證 |
| `type="module"` | ok 跟解析同時 | 預設等同 defer |

相對網址以最後一個斜線之前為基準：`/menu` 和 `/menu/` 結果不同，用 `new URL(href, base)` 驗算。

## D 語意化：選對元素
| 情況 | 用 | 不用 |
|---|---|---|
| 會換網址 | ok `<a href>` | no `<div @click>` 換頁 |
| 原地動作 | ok `<button>` | no `<a href="#">` |
| form 裡不是送出 | ok `type="button"` | warn 沒寫 type 就是 submit |
| 清單、成對資料 | ok ul／ol、dl | no 一串 div |
| 純排版容器 | ok div、span | 沒有語意是應該的 |

landmark：header（banner）、nav、main（一頁一個）、footer（contentinfo）、有名稱的 section（region）；同種 landmark 有多個時各取不同名稱。標題是大綱：一個 h1、不跳級，字級交給 CSS。連結文字要單獨看得懂，名稱要包含可見文字。

## E 表格、圖片、影片與替代文字
- 有列與欄關係的資料用 `<table>`，版面用 Flexbox／Grid；caption 當標題，`<th scope="col|row">` 讓每一格唸得出對應的標題。
- 寬表格放進 `overflow-x: auto` 的容器，加 `tabindex="0"`、`role="region"` 和名稱，整頁不橫向捲動。
- figcaption 給所有人看，alt 給看不到圖的人，兩者不重複。
- 影片給 `controls`、`poster`、`<track kind="captions" default>`；自動播放要 `muted` 並能暫停。

| 圖片用途 | alt 寫什麼 |
|---|---|
| 傳達資訊 | 寫資訊 |
| 當連結或按鈕 | 寫功能 |
| 裝飾 | `alt=""` |
| 複雜圖 | 附完整文字 |

不寫「圖片」、不寫檔名、不堆關鍵字。

## F 原生表單 {span=2}
```flow LR
[label for 與 id] -> *欄位: 可及名稱，點 label 會聚焦
[type、inputmode、autocomplete] -> *欄位
*欄位 -> [required、pattern、min、max]: 瀏覽器內建驗證
[required、pattern、min、max] -> [:user-invalid 樣式]: 不只靠顏色
[:user-invalid 樣式] -> [aria-describedby 提示文字]
*欄位 -> [伺服器再驗證一次]: POST 送出
```
| 屬性 | 決定什麼 |
|---|---|
| `type` | 值與驗證；電話用 `tel`，數量才用 `number` |
| `inputmode` | 只決定鍵盤 |
| `autocomplete` | 自動填入什麼 |

placeholder 和只寫 `aria-label` 都不能代替看得到的 label。radio 同組同 name，用 `fieldset`＋`legend` 給整組標題。按 Enter 時用第一個 submit 按鈕；不用 reset、不用 disabled 擋送出。

```callout warn 前端驗證只是體驗
伺服器一定要再驗證；有個人資料的表單用 POST。
```

## G 無障礙：鍵盤、焦點、對比
```kv cols=1
WCAG 2.2: 原則、指引、成功準則；A／AA／AAA 等級，法規與採購多以 AA 為目標
Tab 順序: 照 DOM 順序；不用 CSS order 或正數 tabindex 打亂；加 skip link
焦點: 一定要看得到，用 `:focus-visible` 設計替代樣式；sticky 頁首用 `scroll-padding-top`
對比: 文字 4.5:1、大字 3:1、元件與圖示 3:1
點擊目標: 至少 24×24 CSS px
```
axe 自動檢查只抓得到一部分，鍵盤與螢幕閱讀器的手動檢查不能省。

## H ARIA 的界線
```callout err ARIA 只改無障礙樹
不改畫面、不加鍵盤行為、不讓元素可以聚焦。能用原生就不用、不改原生語意、互動元件要能用鍵盤、可聚焦元素不能被 aria-hidden。
```
| 情境 | 寫法 |
|---|---|
| 選單開關 | `aria-expanded`，值只能是 true／false |
| 目前這一頁 | `aria-current="page"` |
| 只有圖示的按鈕 | `aria-label` |
| 非同步狀態訊息 | `aria-live="polite"` 或 `role="status"` |
| 模態框背景 | `inert`，或 `<dialog>` 的 `showModal()` |
