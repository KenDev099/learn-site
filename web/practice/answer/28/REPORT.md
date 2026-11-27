# 豆留咖啡官網驗收報告

## 摘要

豆留咖啡官網的首頁、菜單頁、門市頁已完成，14 項驗收標準的自動檢查全部通過。手動檢查找到 1 個已知問題（VoiceOver 唸價目表時少了欄標題），影響小，排在下一個迭代修正。可以上線。

## 範圍

- 頁面：首頁（/）、菜單（/menu/）、大安門市（/store/）、404 頁。
- 裝置：手機 375px（DPR 2）、平板 768px、桌機 1280px；Chrome 最新版，手動抽查 iPhone Safari。
- 不在範圍：線上點餐系統（order.brew.example.tw，另一個團隊負責）、英文版。
- 依據：WCAG 2.2（2024-12-12 版）AA 中可以自動檢查的部分、web.dev 的 Core Web Vitals 門檻、Google Search Central 的技術 SEO 文件。

## 方法

自動檢查：在 learn 資料夾執行 `node check.mjs web 28`。它會用 build.ts 建置網站、用 serve.ts 啟動伺服器，再用 Playwright 1.64.1 驅動本機 Chrome，加上 @axe-core/playwright 4.14.0 掃描。測試會換一組營業時間，確認頁面與 JSON-LD 是從 data/store.json 產生的。

手動檢查清單：

1. 鍵盤：只用 Tab、Shift+Tab、Enter、Esc 走完三頁，打開與關閉手機選單。
2. 螢幕閱讀器：macOS VoiceOver 抽查首頁與菜單頁的標題、landmark、表格。
3. 200% 字級：Chrome 自訂字型把字型大小設為 32（預設的兩倍），以及瀏覽器縮放 200%。
4. 深色模式：系統切到深色，逐頁截圖比對。

自動工具只涵蓋部分 WCAG 準則，所以本報告不宣稱「符合 WCAG 2.2 AA」，只說明檢查了哪些項目。

## 結果

| 代碼 | 驗收標準 | 結果 | 證據 |
|---|---|---|---|
| R1 | 320／768／1280px 無橫向捲動 | 通過 | ex1 R1：三頁 × 三種寬度 scrollWidth 等於 clientWidth |
| R2 | 200% 字級時 320px 無橫向捲動 | 通過 | ex1 R2；另外Chrome 自訂字型設為 32 後手動看過三頁 |
| R3 | 手機選單不靠 JavaScript | 通過 | ex1 R3：<button popovertarget> 打開後「菜單」連結可見 |
| A1 | axe WCAG 2.2 A／AA 無違規 | 通過 | ex1 A1：375 與 1280px 三頁都是 0 violations |
| A2 | 跳到主要內容與鍵盤流程 | 通過 | ex1 A2；手動用 Tab 走完三頁，順序與畫面一致 |
| A3 | 焦點看得見 | 通過 | ex1 A3：每個停點都有 3px outline；手動在深色模式也看過 |
| A4 | 深色模式對比 | 通過 | ex1 A4：color-contrast 0 violations；另外手動截圖比對三頁 |
| P1 | LCP 圖片設定 | 通過 | ex1 P1：LCP 是主視覺 <img>，fetchpriority=high、沒有 lazy |
| P2 | 尺寸預留與字型 | 通過 | ex1 P2：所有 img 有 width、height；網站沒有載入網頁字型 |
| P3 | 初始 HTML 無第三方阻擋腳本 | 通過 | ex1 P3：移除菜單頁的客服 widget 載入程式 |
| P4 | 圖片預算 | 通過 | ex1 P4：手機首頁圖片約 18 KB（只有 hero-960.webp），預算 600 KB |
| S1 | title、description、canonical | 通過 | ex1 S1：三頁 title 不重複，canonical 都是絕對網址 |
| S2 | robots.txt 與 sitemap | 通過 | ex1 S2：拿掉 staging 的 Disallow: /，sitemap 只有三個網址 |
| S3 | 資料一致與 404 | 通過 | ex1 S3：換一組營業時間後頁面與 JSON-LD 一起改變；/no-such-page/ 回 404 |

## 未通過與已知問題

- 已知問題 K1：VoiceOver 在菜單頁的價目表移動到「溫度」欄時，偶爾沒有唸出欄標題。
  - 影響：使用螢幕閱讀器的顧客要多按幾次才知道是哪一欄；價格欄正常。
  - 風險：低，資訊仍然取得得到。
  - 負責人：前端 Ken。
  - 預計處理時間：下一個迭代（兩週內），先在 Safari 與 Chrome 重現再決定要不要改表格結構。

## 下一步

1. 修正 K1，修完重跑自動檢查與 VoiceOver 抽查。
2. 上線後接上 web-vitals 收集真實使用者的 LCP、INP、CLS，四週後對照實驗室結果。
3. 在 Search Console 提交 sitemap，追蹤索引涵蓋範圍。
4. 把 `node check.mjs web 28` 放進 CI，每個 PR 都跑。
