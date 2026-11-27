---
title: HTML 與 CSS 階段 5：SEO 與內容交付
subtitle: 第 22～25 課一頁圖解：搜尋意圖與 title、robots 與 noindex、sitemap 與 canonical、狀態碼、JSON-LD、JavaScript SEO
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 22～25 課
---
SEO 能控制內容與 HTML：讓搜尋引擎爬得到、只收錄該收錄的頁面、看得懂頁面在講什麼。要被搜尋的內容在原始 HTML 裡就要存在。排名與呈現方式由 Google 決定，也不保證收錄。[回 HTML 與 CSS 學習地圖](../index.html)

## A 爬取與索引是兩件事 {span=2}
```flow LR
[發現網址] -> {robots.txt 允許爬?}
{robots.txt 允許爬?} -> [下載、讀內容]: 允許
{robots.txt 允許爬?} -> [不下載，看不到內容；有外部連結時網址仍可能出現]: 禁止
[下載、讀內容] -> {有 noindex?}
{有 noindex?} -> *[進索引，可能出現]: 沒有
{有 noindex?} -> [不進索引]: 有
```
```callout err noindex 不能被 robots.txt 擋住
robots.txt 管下載、noindex 管收錄；爬蟲被擋在門外就讀不到 noindex。不該公開的東西靠登入。
```

## B 搜尋結果的那兩行
| 寫什麼 | 規則 | 注意 |
|---|---|---|
| title | 每頁不同、描述內容、品牌在後、不堆關鍵字；跟 h1 意思一致 | Google 可能改寫 |
| description | 每頁不同、寫頁面上有的具體資訊 | no 不影響排名，只影響點擊；Google 不保證採用 |
| Open Graph | 決定分享卡片；og:image、og:url 寫完整網址 | no 不影響排名 |

依搜尋意圖規劃頁面：一頁回答一個需求，同一個需求不要分散成好幾頁。h1 寫頁面主題；標題不跳級是為了無障礙與可讀性。

## C 連結、麵包屑與網址
- 爬蟲只跟著 `<a href>`；內部連結用描述目的地的錨點文字。
- 麵包屑用 `nav`＋`ol`＋`aria-current="page"`。
- 網址可讀，但已上線的不要為了 SEO 改。

```callout warn Google spam 政策
關鍵字堆砌、隱藏文字、門頁、大量產生的低價值頁面都違反；接手網站時要先找出來移除。
```

## D Robots、sitemap、canonical
```kv cols=1
robots.txt: 依 RFC 9309；爬蟲只用一個群組，最長的規則勝出，一樣長時 Allow 勝；支援 * 與 $；回 5xx 會讓整站停爬
sitemap: 只列 200、可索引、canonical 指向自己的絕對網址；lastmod 要真實；超過 50,000 筆用 sitemap index；Google 忽略 priority 與 changefreq
canonical: 重複網址先用 301 合併，剩下的用絕對網址的 canonical；每頁寫指向自己的；它是建議，所有訊號要一致
hreflang: 多語系互相指向，加上 x-default
```

## E 狀態碼表達頁面的真實狀態
| 狀態 | 狀態碼 |
|---|---|
| 永久移動 | 301／308 |
| 暫時移動 | 302／307 |
| 不存在 | 404／410 |
| 維護 | 503，加 `Retry-After` |
| 內容寫「找不到」卻回 200 | no soft 404 |

避免重新導向鏈與迴圈：直接導到最終網址。這課的商品下架例子：暫時缺貨回 200、永久下架有替代品 301 到替代品、沒有替代品回 404 或 410。

## F JSON-LD 結構化資料 {span=2}
```flow LR
[WebSite] -> [Organization]: publisher
[CafeOrCoffeeShop 門市] -> [Organization]: parentOrganization
[BreadcrumbList] -> [各層頁面網址]: item
```
箭頭都是絕對網址的 `@id` 參照，同一實體只完整描述一次。

| 規則 | 內容 |
|---|---|
| 寫法 | `<script type="application/ld+json">`；嚴格的 JSON，內容來自使用者時要跳脫 `<` |
| 咖啡店 | `CafeOrCoffeeShop`：必填 name、address（PostalAddress 拆欄位） |
| 欄位 | geo 小數 5 位、電話含國碼、url 與 menu 用絕對網址、priceRange 少於 100 字元 |
| 營業時間 | 跨午夜用一個物件、公休寫 00:00–00:00 |
| 麵包屑 | position 從 1 開始、name 跟頁面一致 |

它讓頁面有資格顯示 rich result，但不保證顯示，也不影響排名。

## G 內容一致與驗證
- 結構化資料必須反映看得到的內容；跟頁面從同一份資料、在伺服器端產生，並用自動測試守住一致性。

| 工具 | 看什麼 |
|---|---|
| Rich Results Test | Google rich result 資格 |
| Schema Markup Validator | schema.org 語法 |
| Search Console | 上線後的狀況與人工處置 |

## H JavaScript SEO：Google 看到哪份 HTML {span=2}
```flow LR
爬取 -> {回 200?}
{回 200?} -> [渲染佇列] -> 渲染 -> *索引
{回 200?} --> [不排進渲染]: 不是
```
看到 noindex 可能跳過渲染；其他爬蟲與分享預覽不一定執行 JS。

| 做法 | 原始 HTML | 要被搜尋的頁面 |
|---|---|---|
| CSR | 只有空的 `#app` | no |
| SSR、SSG | 內容與 head 已經存在 | ok |

SPA 檢查清單：
- `<a href>` 連結、History API 路由。
- 每個路由有唯一的 title／description／canonical。
- 正確的 404；原始 HTML 不放要被 JS 移除的 noindex。
- 內容不用互動就看得到，分頁有自己的網址。

驗證順序：curl 看原始 HTML → Search Console 網址審查 → 網頁索引與 Core Web Vitals 報告；把這些檢查寫進 PR 範本與 E2E。
