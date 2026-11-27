---
title: HTML 與 CSS 階段 4：除錯、瀏覽器與效能
subtitle: 第 18～21 課一頁圖解：DevTools、渲染流程、Core Web Vitals、資源優先序與效能預算
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 18～21 課
---
先重現、量到原因再改：DevTools 找出哪裡錯，渲染流程說明為什麼卡，Core Web Vitals 把「很慢」變成數字，效能預算讓它不再變慢。[回 HTML 與 CSS 學習地圖](../index.html)

## A 除錯流程與 Styles 面板 {span=2}
```flow LR
重現 -> [縮小範圍] -> 假設 -> 驗證 -> *修正 -> [防止再發生]
```
DevTools 用在前四步，確定原因才改原始碼。

| Styles 裡看到 | 意思 |
|---|---|
| 由上到下 | 層疊的勝負順序 |
| 劃線 | 被蓋掉 |
| 劃線加警告圖示 | 不合法 |
| 變淡加資訊圖示 | 合法但沒有效果 |

`:hov` 強制狀態、`.cls` 切換 class、核取方塊停用宣告，都是驗證假設的工具。

## B DevTools 其他面板
```kv cols=1
Computed: 最終值與它的來源；盒模型圖看尺寸
Layout: Grid／Flexbox 疊加層看版面；手機能左右滑時找出比畫面寬的元素
裝置模式: 模擬尺寸與觸控；Safari 的問題用真機
Rendering: 模擬深色模式、減少動態、列印、色覺障礙
Network: 狀態碼、傳輸量與資源大小、時間、優先順序；Disable cache 加節流模擬第一次造訪
HAR: 可以匯出分析，分享前檢查敏感資料
```
bug 報告要有環境、步驟、預期、實際與最小重現。

## C 一幀裡的五個步驟 {span=2}
```flow LR
JavaScript -> Style -> Layout -> Paint -> *Composite
```
改動從哪一步開始，後面都要重做；前四步都在主執行緒上。

| 改了什麼 | 例子 | 要重做 |
|---|---|---|
| 大小或位置 | `width`、`top`、`margin`、`font-size` | Style → Layout → Paint → Composite |
| 只改像素 | `color`、`background-color`、`box-shadow` | Style → Paint → Composite |
| 合成屬性 | `transform`、`opacity` | 通常只要 Style → Composite |

最後以 Performance 面板與 Paint flashing 量到的為準。

## D 讓主執行緒不卡
```callout err 強制同步 layout
寫了會影響版面的樣式後馬上讀 `offsetHeight`、`getBoundingClientRect()`，會強制同步 layout；在迴圈裡交錯就是版面抖動。先讀後寫。
```
- 超過 50ms 的長任務會擋住點擊、拉長 INP：切段讓出主執行緒，或減少 DOM 與工作量。
- `content-visibility: auto` ＋ `contain-intrinsic-size: auto <高度>` 讓畫面外的區塊先不渲染，內容仍可搜尋、聚焦、被輔助科技讀到；首屏不要套，paint containment 會裁切。
- 圖層讓合成便宜，但每層都吃記憶體；`will-change` 先量再用。

## E Core Web Vitals
| 指標 | 「好」的門檻 |
|---|---|
| LCP | ok ≤ 2.5s |
| INP | ok ≤ 200ms |
| CLS | ok ≤ 0.1 |

等於門檻算好；以真實使用者的 p75 評估，手機和桌機分開。

| 資料 | 優點 | 限制 |
|---|---|---|
| 實驗室：Lighthouse、DevTools | 可重現、能除錯 | warn 只是一種情境、沒有互動 |
| 真實：CrUX、RUM | 代表使用者體驗 | CrUX 是過去 28 天的 Chrome 使用者 |

## F 三個指標怎麼拆
```kv cols=1
LCP: TTFB、資源載入延遲、資源載入時間、元素渲染延遲；看哪一段超出建議比例最多
CLS: 取分數最高的 session window（間隔 < 1 秒、最長 5 秒）；點擊、按鍵後 500ms 內的位移不算，捲動不算輸入
INP: 互動延遲的高百分位，每 50 次互動忽略一次最高的；拆成輸入延遲、處理時間、呈現延遲
```
用 web-vitals 的 attribution 版本收 RUM，`visibilitychange` 時用 `sendBeacon` 送出；後端依裝置、頁面類型算 p75，持續追蹤。

## G 從瀑布圖調整優先序 {span=2}
```flow LR
[瀑布圖] -> {LCP 資源太晚被發現?}
[瀑布圖] -> {頻寬被誰佔走?}
[瀑布圖] -> {誰擋住解析與渲染?}
[瀑布圖] -> {跨 origin 連線?}
{LCP 資源太晚被發現?} -> [preload、fetchpriority high]
{頻寬被誰佔走?} -> [preload 只給一兩個、第三方延後或 facade]
{跨 origin 連線?} -> [preconnect 關鍵 origin]
{誰擋住解析與渲染?} -> [script defer、列印樣式 media print]
```
| 提示 | 給誰 |
|---|---|
| `preconnect` | 2–3 個關鍵 origin |
| `preload` | 晚被發現的關鍵資源 |
| `fetchpriority="high"` | LCP |

優先序工具是提示，越少越有效。第三方腳本先盤點再處理：不需要就移除、不急就延後、首屏用不到的互動元件改 facade，並同步更新 CSP。

## H 效能預算與回歸監控
| 預算類型 | 這課的例子（咖啡店首頁，手機） |
|---|---|
| 數量型 | JS 合計 ≤ 300 KB、第三方請求 ≤ 3 個 |
| 時間型 | 實驗室 LCP ≤ 2.5 秒、TBT ≤ 200 ms |
| 規則型 | Lighthouse 效能分數 ≥ 0.9 |

預算從現況或目標反推，寫進 CI 才有效。回歸判斷用 3–5 次量測的中位數、跟基準分支比較、設容忍值；上線後用 RUM 的 p75 警報補上實驗室看不到的部分。

```callout info 驗收標準與效能提案
驗收標準寫清楚指標、裝置、百分位、資料來源與期間。提案寫問題、原因、做法、預期改善、成本與驗收方式。
```
