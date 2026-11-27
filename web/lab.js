// HTML、CSS 與網頁基礎 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'web-progress'
export const STAGES = [
  ['階段 1：HTML 與可操作的網頁', [
    [1, '網頁文件基礎：DOM、head、metadata、資源載入與路徑', '01-document-basics.html'],
    [2, '語意化 HTML：標題、landmark、連結、按鈕與列表', '02-semantic-html.html'],
    [3, '內容結構：表格、圖片、影音與替代文字', '03-tables-media-alt.html'],
    [4, '原生表單：label、input、autocomplete、驗證與錯誤提示', '04-native-forms.html'],
    [5, '無障礙基礎：鍵盤、焦點、對比、螢幕閱讀器與 ARIA 的使用界線', '05-accessibility.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：CSS 與版面基本功', [
    [6, 'CSS 層疊：來源、權重、繼承與 cascade layers', '06-cascade-layers.html'],
    [7, '盒模型與正常流：尺寸、display、overflow 與 margin', '07-box-model-flow.html'],
    [8, 'Flexbox', '08-flexbox.html'],
    [9, 'Grid 與 subgrid', '09-grid-subgrid.html'],
    [10, '定位與堆疊：position、sticky、stacking context 與 z-index', '10-position-stacking.html'],
    [11, 'RWD：mobile-first、media queries、內容斷點與觸控', '11-responsive-design.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：現代 CSS 與視覺品質', [
    [12, '現代 CSS：container queries、:has()、nesting 與功能支援檢查', '12-modern-css.html', '選修'],
    [13, '流動尺寸與邏輯屬性：相對單位、min/max/clamp、viewport units（含多語系與直排/RTL 的影響）', '13-fluid-logical.html', '選修'],
    [14, '圖片實務：格式、srcset/sizes、尺寸預留與載入策略', '14-images.html', '選修'],
    [15, '字型與排版：中文字型、子集化、font-display 與版面穩定', '15-fonts-typography.html', '選修'],
    [16, '主題與設計變數：custom properties、色彩、間距與深色模式', '16-theming-tokens.html', '選修'],
    [17, '動畫與微互動：transition、keyframes、transform 與 prefers-reduced-motion', '17-motion.html', '選修'],
  ], 'sheets/stage-3.html'],
  ['階段 4：除錯、瀏覽器與效能', [
    [18, 'DevTools 日常除錯：Elements、Computed、版面工具、Network', '18-devtools.html'],
    [19, '瀏覽器渲染：style、layout、paint、composite 與避免反覆重排', '19-rendering-pipeline.html'],
    [20, 'Web 效能量測：LCP、INP、CLS，實驗室與真實使用者資料', '20-web-vitals.html'],
    [21, '效能改善與驗收：資源優先序、第三方腳本、效能預算與回歸監控（資深）', '21-performance-budgets.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：SEO 與內容交付', [
    [22, 'SEO 基礎：搜尋意圖、title、description、標題結構與內部連結', '22-seo-basics.html'],
    [23, '技術 SEO：爬取與索引、robots、noindex、sitemap、canonical、狀態碼與重新導向', '23-technical-seo.html'],
    [24, '結構化資料：JSON-LD、內容一致性與驗證', '24-structured-data.html', '選修'],
    [25, 'JavaScript SEO：CSR/SSR/SSG 與可索引內容、Search Console 驗證（資深）', '25-javascript-seo.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：資深整合實戰', [
    [26, '設計系統：design tokens、元件狀態、文件與版本（資深）', '26-design-system.html', '選修'],
    [27, '自動化驗收：Playwright E2E、視覺回歸、無障礙掃描與 flaky test 排查（資深）', '27-e2e-acceptance.html'],
    [28, '期末專題：咖啡店公開網站（RWD、無障礙、效能、SEO 驗收報告）', '28-capstone.html'],
  ], 'sheets/stage-6.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
