---
title: HTML 與 CSS 階段 2：CSS 與版面基本功
subtitle: 第 6～11 課一頁圖解：層疊與 layer、盒模型、Flexbox、Grid 與 subgrid、定位與堆疊、RWD
cols: 3
theme: shadcn
課程: HTML 與 CSS 第 6～11 課
---
先知道哪一條宣告會贏，再知道元素怎麼決定大小與位置：一維用 Flexbox、二維用 Grid、疊加用 position，從最窄的螢幕往上加。[回 HTML 與 CSS 學習地圖](../index.html)

## A 同一個屬性多條宣告，誰贏 {span=2}
```flow LR
[來源與 !important] -> [inline style] -> [cascade layer] -> 權重 -> [出現順序]
```
依序比，某一步分出高下就停。

```css
@layer reset, vendor, base, components, utilities;
@import … layer(vendor);
```
第一行宣告層的順序，第三方放進低層。沒分層的樣式勝過所有層；`!important` 的層順序反過來。團隊用 lint 限制 `!important` 與權重，用 layer 與命名規則（BEM、CSS Modules、scoped）避免衝突。

## B 權重與繼承
| 選擇器 | 權重怎麼算 |
|---|---|
| 一般 | (ID, class／屬性／偽類, 型別／偽元素)，逐欄比不進位 |
| `:is()`、`:not()`、`:has()` | 取參數裡最高的 |
| `:where()` | 0 |

- 文字類屬性會繼承，盒子類不會。
- 任何宣告（包括瀏覽器預設）都會讓繼承失效，所以表單控制項要 `font: inherit`。
- `initial` 是規格的初始值、`unset` 看屬性會不會繼承、`revert` 退回瀏覽器預設。

## C 盒模型與正常流
```kv cols=1
box-sizing: 預設 content-box 的 width 只算內容；全站設 border-box，width 包含 padding 與 border
正常流: block 由上往下、inline 由左往右；inline 不吃 width 與垂直 margin
display 兩層: 外部 block／inline，內部 flow、flex、grid；flow-root 建立新的 BFC
margin 合併: 相鄰垂直 margin 取較大的；父子沒隔開時子元素的 margin 會穿出去
寬度: max-width 給上限、圖片 max-width: 100%；fit-content、min-content、max-content 讓元素依內容決定寬度
```
| 溢出情況 | 寫法 |
|---|---|
| 可能很寬的內容 | `overflow-x: auto` 自己捲動 |
| 裁切 | `clip` |
| 長字串、長網址 | `overflow-wrap: anywhere` |
| 單行省略號 | nowrap＋overflow＋text-overflow |

間距用 padding、`flow-root`、gap 控制，不用負 margin。

## D Flexbox：一維排列
- justify-content 管主軸、align-items／align-self 管交錯軸；`flex-direction: column` 時兩條軸對調。
- 間距用 `gap`；推到一邊用 `margin-left: auto`；高度不同用 `align-items: center`，文字用 baseline。
- `flex: grow shrink basis`：basis 是起點，grow 分剩下的，shrink 按 shrink × basis 分攤不足的。

| 簡寫 | 等於 |
|---|---|
| `flex: 1` | `1 1 0%` |
| `flex: auto` | `1 1 auto` |
| `flex: none` | `0 0 auto` |

```callout warn 長內容撐破 flex 子元素
flex 容器的直接子元素預設 `min-width: auto`（＝min-content）。在那個子元素寫 `min-width: 0`；固定大小的子元素寫 `flex-shrink: 0`。
```
`flex-wrap: wrap` 加上有 basis 的子元素，不用 media query 也會換行。`order` 與 reverse 只改畫面、不改焦點順序。

## E Grid 與 subgrid：二維格線 {span=2}
| 寫法 | 做什麼 |
|---|---|
| 格線編號 | `-1` 是最後一條；沒定義的列自動產生，大小由 `grid-auto-rows` 決定 |
| `fr` | 分配扣掉固定軌道與 gap 後的剩餘空間；`1fr` 下限是 auto，需要時改 `minmax(0, 1fr)` |
| `repeat(auto-fill, minmax(min(280px, 100%), 1fr))` | 不寫 media query 也會換欄，手機上不溢出 |
| auto-fit | 子元素填不滿一列時空欄收合、子元素伸展 |
| `grid-template-areas` | 把版面畫出來，換版面只改容器 |
| `grid-column: 1 / -1`、`span N` | 跨整列、跨 N 格 |
| `dense` | warn 會打亂順序，有閱讀順序的內容不用 |

```flow LR
[外層 grid] -> [卡片 grid-row: span 4]: 佔 4 列
[卡片 grid-row: span 4] -> [grid-template-rows: subgrid]
[grid-template-rows: subgrid] -> *跨卡片對齊: 沿用外層的列
```
subgrid 的 gap 會繼承，自己用 `row-gap` 覆寫。各寬度的畫面順序都要跟 DOM 順序一致。

```callout ok Flexbox 還是 Grid
一維、大小由內容決定用 Flexbox；二維、由版面決定用 Grid；兩者常一起用。
```

## F 五種 position
| 值 | 以誰為準 | 佔空間 |
|---|---|---|
| static（預設） | 不能偏移 | ok |
| relative | 自己的原位 | ok |
| absolute | 最近的已定位祖先 | no 脫離正常流 |
| fixed | 視窗；祖先有 transform、filter 等時改以祖先為準 | no |
| sticky | 父元素裡，相對最近的捲動容器黏住 | ok |

徽章：父層 `position: relative`、徽章 `position: absolute` 加偏移；整頁版面不用 absolute。sticky 失效先查：有沒有寫 top、祖先 overflow 是不是 visible／clip 以外的值、父元素有沒有比它高。

## G 為什麼 z-index 蓋不過
```flow TB
[根層 stacking context] -> [頁首 sticky，層級 0，DOM 第 1]
[根層 stacking context] -> *[卡片 will-change，層級 0，DOM 第 2]
[頁首 sticky，層級 0，DOM 第 1] -> [下拉選單 z-index 9999]: 只跟頁首裡的元素比
```
這課的例子：卡片在 DOM 後面，畫在上面；修法是給頁首這一層 z-index。z-index 只在同一個 stacking context 裡比較。position 加 z-index、fixed／sticky、opacity < 1、transform、filter、will-change、isolation 都會建立新的 context。全站用 `--z-*` 刻度，元件內部用 `isolation: isolate` 加小數字；`<dialog>` 與 popover 進入 top layer，不需要 z-index。

## H RWD：從最窄的螢幕往上加
```kv cols=1
mobile-first: 基本樣式給最窄的螢幕，再用 (width >= …) 往上加；HTML 順序就是手機的閱讀順序
斷點: 看內容，不看手機型號，通常 2～3 個；media query 的 em 以瀏覽器預設字級計算，調大字級時斷點跟著移動
範圍語法: (40em <= width < 64em)，不會有 767.5px 的縫
hover、pointer: 問主要輸入裝置的能力；hover 效果包在 (hover: hover) 裡
點擊目標: 至少 24×24（AA），主要操作建議 44×44，相鄰按鈕隔 8px 以上
```
驗收 320px 寬（1.4.10）與文字放大 200%（1.4.4）：不固定 height、不用 px 固定寬度與字級、讓一列可以換行。
