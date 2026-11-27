---
title: HTML 與 CSS 階段 3：現代 CSS 與視覺品質
subtitle: 第 12～17 課一頁圖解：container queries 與 :has()、流動尺寸與邏輯屬性、圖片、字型、主題變數、動畫
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 12～17 課
---
元件看自己的容器、尺寸跟著空間與使用者設定流動；圖片與字型只下載需要的、先預留空間；顏色與間距收進變數，動畫要有目的，也要能關掉。[回 HTML 與 CSS 學習地圖](../index.html)

## A Media query 還是 container query {span=2}
```flow LR
{要看什麼決定版面?} -> [media query]: 頁面骨架、裝置偏好
{要看什麼決定版面?} -> *[container query]: 可重複使用的元件
*[container query] -> [外層 container-type: inline-size]: 元素不能查詢自己
[外層 container-type: inline-size] -> [cqi 搭配 clamp]: 容器寬度的 1%
```
同一張卡片放進側欄就擠爆，是 media query 只看視窗的結果；container query 讓卡片依「自己被放進多寬的容器」改版面。

## B :has()、nesting 與能不能用
- `:has()` 依「裡面有什麼」或表單狀態選中外層元素，權重取參數最高者；錨點貼近目標，避免 `body:has()`。
- 原生 nesting 的 `&` 是選擇器不是文字，不能寫 `&__item`；巢狀會提高權重，不超過 3 層。

| 狀態 | 意思 |
|---|---|
| Baseline newly available | 核心瀏覽器最新版都支援 |
| Baseline widely available | newly available 再過 30 個月 |
| `@supports` | 先寫能用的，支援時再加強 |

## C 單位跟著什麼變
| 單位 | 適合 |
|---|---|
| `rem` | 字級、間距 |
| `em` | 元件內的比例；中文行長 |
| `%`、`fr` | 版面 |
| `ch` | 英文行長 |
| `px` | 細線、邊框 |

```callout warn 流動字級要有 rem
`clamp()` 的偏好值是一條直線：截距用 rem、斜率用 vw，再用 rem 的上下限夾住，使用者放大字級才有效。
```

## D Viewport 單位與邏輯屬性
```kv cols=1
vh: 等於 lvh；首屏用 100svh，dvh 只給不捲動整頁的介面
100vw: 包含捲軸寬度，全寬元素不要用它
邏輯屬性: inline 是文字前進、block 是行堆疊，用 start／end 取代左右；同一份 CSS 在 LTR、RTL、直排都對
多語系: HTML 寫 lang 與 dir；方向性圖示用 :dir(rtl) 鏡像，數字不翻；不固定寬度
直排: writing-mode、縱中橫、text-orientation
```

## E 圖片：只下載需要的大小 {span=2}
```flow LR
[Network 量實際下載量] -> {圖檔寬約等於顯示寬度 × DPR?}
{圖檔寬約等於顯示寬度 × DPR?} -> [srcset w 描述子 + sizes]: 太大
[srcset w 描述子 + sizes] -> [picture 選格式、換裁切]
[picture 選格式、換裁切] -> *[img 帶 alt、width、height]
```
| 圖 | 格式 / 載入 |
|---|---|
| 照片 | AVIF／WebP，留 JPEG 備援 |
| 圖示 | SVG；文字不做成圖片 |
| LCP 圖 | no 不 lazy，加 `fetchpriority="high"` |
| 首屏以下 | ok `loading="lazy"` |
| 重要圖片 | no 不用 CSS 背景 |

srcset 與 sizes 讓瀏覽器在 CSS 載入前選圖，sizes 要跟 CSS 一致。width、height 屬性加 CSS `height: auto` 預留空間；非圖片容器用 `aspect-ratio`。圖檔由建置流程或圖片 CDN 產生，檔名帶 hash 才能 `immutable` 長期快取。

## F 中文字型與排版
- 繁中字型一個字重就好幾 MB。內文用系統字型堆疊：蘋方 → Noto Sans TC → 微軟正黑體 → `sans-serif`；`system-ui` 不放在繁中字型前面。
- 網頁字型用 `@font-face` 宣告、一律 WOFF2；子集化只留用得到的字（先確認授權），`unicode-range` 只下載頁面用到的切片。
- preload 只給首屏關鍵的一個檔案，要加 `crossorigin`。

| font-display | 用在 |
|---|---|
| `swap` | ok 標題 |
| `optional` | ok 內文 |
| `block` | no 幾乎不用 |

換字型時的位移：先用無單位 `line-height`，再用 `ascent-override`、`descent-override`、`size-adjust` 做度量相同的備援字型（Safari 不支援 override，會忽略）。中文內文行高 1.7～1.8、一行約 30～40 字；標題加 `text-wrap: balance` 當漸進增強。

## G 主題與設計變數
```flow TB
[palette 描述外觀] -> [語意變數描述用途]
[語意變數描述用途] -> *元件: 只用語意變數
[深色模式] --> [語意變數描述用途]: 換主題只改這一層
```
- custom properties 以 `--` 開頭、用 `var()` 讀取、會繼承，可以在任何元素上局部覆寫；`var(--x, 預設值)` 處理沒定義；代入後不合法時屬性變成 unset，不會退回前一條宣告。
- `oklch()` 固定色相、改亮度做色階；`color-mix(in oklch, …)` 算 hover 等狀態色。每次調色都重算 4.5:1。
- 深色模式：`color-scheme: light dark`，語意變數用 media query 或 `light-dark()` 切換；`data-theme` 手動選擇要勝過系統偏好，四種組合都要測。
- 間距用 rem 定義 4／8 為基準的刻度，元件只挑刻度上的值。

## H 動畫與微互動
| 做法 | 結果 |
|---|---|
| transform 位移縮放、opacity | ok 通常只需要合成 |
| top、margin、width | no 每一幀重新排版 |
| `transition: all` | no 明確列出屬性 |
| `will-change` | warn 量過之後的最後手段 |

動畫用在回饋、關聯、注意；說不出目的的就是裝飾。transition 寫在元素平常的狀態，hover 與 `:focus-visible` 一起處理。微互動 100～300ms；進場 ease-out、離場 ease-in、重複的動畫 linear。

`@keyframes` 定義多個時間點，`animation-fill-mode` 決定開始前、結束後的樣子；`infinite` 動畫要能用 `animation-play-state: paused` 停下來。

```callout warn prefers-reduced-motion: reduce
拿掉位移、縮放、自動播放與平滑捲動，保留顏色、透明度與內容。自動播放超過 5 秒的內容要有一直保持的暫停控制（WCAG 2.2.2）。
```
