---
title: HTML 與 CSS 階段 6：資深整合實戰
subtitle: 第 26～28 課一頁圖解：design tokens 與元件狀態、版本治理、Playwright 驗收、期末驗收報告
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 26～28 課
---
把規則變成能檢查的東西。tokens 與狀態矩陣統一元件，Playwright 在每個 PR 自動驗收，驗收報告用可檢查的標準證明網站能用。[回 HTML 與 CSS 學習地圖](../index.html)

## A Design tokens 的三層 {span=2}
```flow LR
[原始 color.brown.700] -> [語意 color.action.primary]: 別名
[語意 color.action.primary] -> *[元件 button.primary.bg]: 別名
```
| 層 | 名字描述 | 改它的影響 |
|---|---|---|
| 原始 | 外觀：`color.brown.700`、`space.4` | 所有參照它的語意 token |
| 語意 | 用途：`color.action.primary` | 這種用途的所有地方；換主題改這層 |
| 元件 | 元件的部位：`button.primary.bg` | 只有那個元件 |

DTCG 2025.10 用 `$value`、`$type`（從群組繼承）、`{a.b}` 別名描述；轉成 CSS 時別名輸出 `var()`，不是展開，錯誤在建置時擋下。

## B 設計系統值不值得做
```kv cols=1
組成: tokens、元件、模式、文件、治理
帶來: 一致、速度、內建的無障礙
代價: 要當成產品長期維護
時機: 只有一個產品時不急著做
元件文件: 用途、不要用在、變體、狀態、無障礙、內容指引、程式範例
```

## C 元件狀態用 DOM 表達
| 狀態 | 選擇器 |
|---|---|
| hover | `:hover` |
| 鍵盤焦點 | `:focus-visible` |
| 停用 | `:disabled` |
| 忙碌（送出中） | `[aria-busy="true"]` |
| 按下 | `[aria-pressed="true"]` |

先列狀態矩陣再實作，外觀與 DOM 狀態不會分家。送出中不用 disabled；停用與忙碌時沒有 hover；按下的狀態不只靠顏色。

## D SemVer：改動會不會弄壞別人
| 改動 | 版本 | 為什麼 |
|---|---|---|
| 移除或改名 token／prop、改 DOM 結構、改預設行為 | major | no 使用者的程式碼、選擇器或表單行為可能失效 |
| 新增、標記棄用 | minor | ok 舊的寫法照常運作 |
| 改值 | patch | warn API 不變，但要檢查對比 |

```flow LR
[新增 + 棄用別名] -> [下一個 major 移除]
```

## E E2E 只留給關鍵流程 {span=2}
```flow LR
[locator：getByRole、getByLabel、getByText] -> [動作：等到可以操作]
[動作：等到可以操作] -> *[web-first assertion：重試到成立或逾時]
[web-first assertion：重試到成立或逾時] -> [axe 掃描：互動之後再掃]
```
E2E 用真的瀏覽器驗證各部分接得起來，慢而且比較容易時好時壞；規則的細節交給單元與元件測試。locator 每次使用時才查詢，用角色與 label 找元素，測試同時驗證了可及名稱；多個元素符合時先縮小範圍，不用 `.nth()`。

```callout warn 無障礙掃描
`@axe-core/playwright` 要用 `newContext()` 建立的 page，WCAG 各版本的標籤要全部列出；例外要追蹤，不要關規則。
```

## F 視覺回歸與 flaky test
| 情況 | 做法 |
|---|---|
| 視覺回歸 | 先固定動畫、時間、資料、字型與環境，再用 `mask` 遮住會變的區塊 |
| 基準圖 | 在 CI 的映像裡產生，改變時隨 PR 審查 |
| 固定時間等待、先讀值再比對 | no flaky 的主要來源 |
| flaky test | 重現（`--repeat-each`）、看 trace、依類型修根因、量化比例 |
| `retries` | warn 只是止血 |

狀態碼、noindex、title、canonical、JSON-LD、首圖設定都可以對每個路由自動檢查，放進 CI 當合併前的關卡。

## G 期末：驗收標準要能檢查 {span=2}
```flow LR
[內容] -> [版面] -> [視覺與互動] -> [head 與資料] -> *驗收
*驗收 --> [內容]: 每頁做完就驗一次
```
每條標準回答檢查什麼、怎麼檢查、多少算過，並給代碼。這課專題的例子：

| 代碼 | 標準 |
|---|---|
| R1 | 三頁在 320、768、1280px 寬不橫向捲動 |
| A1 | axe（WCAG 2.2 A／AA 標籤）0 個違規，手機與桌機各掃一次 |
| P1 | 首頁 LCP 元素是主視覺，沒有 lazy、有 `fetchpriority="high"` |
| S1 | 每頁 title 不重複、有 description、恰好一個指向自己的絕對網址 canonical |

會出現在多處的資料只存一份，建置時產生 HTML 與 JSON-LD；用換一組資料重建來驗證。

## H 驗收報告寫給要做決定的人
```callout info 自動檢查加手動檢查
自動檢查證明沒有已知的錯；手動檢查（鍵盤、螢幕閱讀器、200% 字級、深色模式）確認真的能用。兩者都寫進報告。
```
- 摘要先講結論，證據具體到能核對。
- 未通過與已知問題寫出影響、風險、負責人、時間。
- 說明取捨：用了哪些新功能、不支援時會怎樣、刻意不用什麼。
