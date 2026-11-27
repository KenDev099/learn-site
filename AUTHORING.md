# 課程撰寫規範

寫新的一課（或改舊的課）之前先讀完這份。範本：`typescript/lessons/01-closures-this.html`（JavaScript 執行題）、`web/lessons/01-document-basics.html`（HTML／CSS 題與 TypeScript 題混合）、`typescript/lessons/13-what-is-ts.html`（TypeScript 型別題）、`postgresql/lessons/19-concurrency.html`（SQL 題）。

## 讀者與原則

讀者是前端工程師：每天寫 Vue 3，會用 JS／TS，從零開始學後端，目標是成為資深工程師。使用者的要求：

> 從基礎到資深應具備知識點，走向資深工程師應具備的能力，確保用戶學會，不假設用戶知道該知識。

所以每一課都要做到：

- **不假設知識**：每個名詞第一次出現就解釋，中文在前、英文放括號，例如「冪等（idempotent）」，一兩句說清楚它是什麼、為什麼需要。用到前面教過的東西，寫出「第 N 課教過的 X」並加連結；別門課的用相對路徑，例如 `<a href="../../node/lessons/13-http-server.html">Node 課第 13 課</a>`。
- **先講為什麼**：先給咖啡店的實際情境，讓學習者看到不懂這個會出什麼事，再講怎麼做。常用的順序是：示範問題 → 解釋原因 → 修正 → 再看一個變化。
- **一次一個重點**：範例從小到大，一步只多一樣東西。
- **資深視角**：講取捨（什麼時候用、什麼時候不用、代價是什麼）、正式環境會遇到的狀況、出問題時怎麼查。知識之外，也要練判斷力。
- **正確優先**：跟版本有關的說法，都先用 Context7 或官方文件查證，並寫出版本。查不到、不確定的就不寫。
- **不灌水**：不寫「簡單來說」「值得注意的是」「非常重要」這類填充句，不用誇張形容。句子短、直接。

## 檔案與頁面骨架

- 課程頁：`<課程>/lessons/NN-slug.html`，課號、課名、檔名跟 `<課程>/lab.js` 的 `STAGES` 一致。
- 上一課／下一課的導覽、練習進度、選擇題的互動都由 `course.js` 自動產生，不要自己寫。

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>N. 課名</title>
<link rel="stylesheet" href="../../style.css">
</head>
<body data-lesson="N">
<header>
  <div class="eyebrow">階段 X：階段名稱 · 第 N 課</div>
  <h1>課名</h1>
</header>
<main>
…內容…
</main>
<script type="module" src="../lab.js"></script>
</body>
</html>
```

`<body>` 的屬性：

| 屬性 | 用途 |
|---|---|
| `data-lesson="N"` | 必填，課號 |
| `data-lang="js"` | 整頁的練習寫 JavaScript（沒有型別檢查） |
| `data-ts='{"experimentalDecorators":true,"emitDecoratorMetadata":true}'` | 這一頁的 TypeScript 要額外的編譯選項 |
| `data-practice="node"` | 這一頁有本機練習，練習資料夾是 `node/practice/` |
| `data-task="auth20"` | 本機練習的題號不是兩位數課號時才加 |

## 內容順序

1. **開場**（1–2 段）：這課解決什麼問題、學完能做什麼。
2. **這課會用到**：`<div class="callout"><strong>這課會用到：</strong>…</div>`，列出先備知識並連到出處。沒有先備知識就省略。
3. **概念**：4–7 個 `<h2>` 小節，穿插可執行的範例、圖、表、提醒。
4. **練習**：`<h2>練習</h2>`，動手題 3–5 題加選擇題 3 題，全部從「練習 1」連續編號（選擇題也算）。
5. **常見錯誤**：`<h2>常見錯誤</h2>`，條列，每點是「<strong>錯誤</strong>：原因與正確做法」。
6. **小結**：`<h2>小結</h2>`，條列這課的重點；最後一段用一句話預告下一課（最後一課改成「接下來可以學什麼」）。

篇幅不設上限，以內容需要為準。判斷標準是讀者跟不跟得上，見下面「讓讀者跟得上」。

### 💡 實務上（燈泡區塊）
讀者是從零走向資深的全端工程師，可能還沒有實戰經驗。重要的概念講完後，緊接著放一個燈泡區塊，讓讀者對「工作中會在哪裡遇到」有具體印象：
- **放哪裡**：放在講完那個概念的段落後面（不是集中在課末）。一課 2–4 個，只放在真的有實務意義的地方，不要每段都放。
- **寫什麼**（擇要，4–6 句內）：
  - **用在哪**：具體的場景，例如「咖啡店後台的訂單列表」「上線前的 migration」「客服回報的 bug」，或常見產品／系統裡的例子。
  - **要考量什麼**：取捨、常見坑、什麼時候不該用、團隊裡誰會關心（PM、維運、資安）。
  - **資深會怎麼做**（有的話）：檢查清單、會先問的問題、怎麼跟別人溝通。
- **不要寫**：重複前面的內容、空泛的「這很重要」、冷門的底層細節、沒查證的數字。
- 標題一句話點出重點，例如 `💡 實務上：分頁幾乎每個列表 API 都會用到`。

## 讓讀者跟得上

內容多、先備知識多的課（多半是資深階段），讀者最容易在這幾個地方跟丟。每一課都適用：

1. **開場問題先回答**：開場情境提出的問題，最晚在第 2 個 `<h2>` 結束前給出最小版本的答案，後面的小節再補細節。超過 5 列的參考表放在讀者已經有理由查它之後，並寫明「查表用，不用背」。
2. **一個名詞一個叫法**：同一個東西全課只用一種寫法。需要對照（例如 `ACCESS SHARE` 和 `pg_locks` 裡的 `AccessShareLock`）就集中在一張表講一次。以讀者要打的那種寫法為準；英文名字會誤導時，只在第一次出現時用白話解釋一次，不另取第二個名字。
3. **一格範例只觀察一件事**：每格前面用一句話說「執行後看哪裡」。同一段樣板 SQL 出現 2 次以上，就收進 seed 的輔助函式（像 `try_sql`、`plan_nodes`），在第一次用到的地方介紹，介紹前先讓讀者看過一次完整寫法。查系統視圖（例如 `pg_locks`）的輔助物件用函式，不用 view：view 自己也會拿鎖，會出現在結果裡。
4. **環境限制集中**：PGlite、單一連線、用 `PREPARE TRANSACTION` 模擬同事、「必須單獨一格」這類說明，集中成課首的一個 callout，最多 3 行，只寫讀者會遇到的現象（例如「這頁只有一條連線，看不到別人，所以用時間軸示範」），可以提到還沒教的名詞但不在這裡解釋；做法和名詞留到正文第一次用到時再講，之後指回去。第一個 `<h2>` 之前的內容（開場、路線、會用到、環境、資料）加起來要能一眼掃完。課末的「版本備註」照舊。
5. **不留孤立條列**：「兩個細節」「兩個實務結論」「注意兩個陷阱」這種接在段落後面的條列，每一點併回它所屬的段落、移到「常見錯誤」，或者跟別處重複就刪掉。
6. **先備知識附一句回顧**：「這課會用到」最多列 4 項真正擋路的，每項附一句回顧，例如「第 19 課的 `FOR UPDATE`（鎖住選到的列，直到交易結束）」。其餘的在用到的地方就地連結。
7. **解釋結果的段落不超過 3 個事實**：超過就改成條列，順序對應結果畫面由上到下。
8. **給路線和銜接句**：開場後加 3–5 行「這課的路線」，每行對應一或兩節，說明它回答什麼問題；每個 `<h2>` 的第一句接上一節。

## 敘事要連貫：用問題推動，不要想到什麼說什麼

讀者最常抱怨的不是內容少，而是跳躍：每段單獨看都對，但不知道為什麼現在讀這段、它跟上一段有什麼關係。寫法要像資深工程師針對一個問題深入回答，而不是列知識點。

1. **一課一個貫穿的任務**：開場提出一個具體任務或事故（例如「同事把折扣公式改壞了，怎麼在存檔當下就知道」），正文從頭到尾都在推進它。範例沿用同一個情境、同一份資料，不要每節換一個例子；需要新例子時說明為什麼原本的例子不夠。
2. **每節由上一節留下的問題推動**：`<h2>` 用問句或任務當標題（例如「測試替身：不連資料庫怎麼測下單？」）。每節最後一段留下「但這樣還有一個問題」，下一節的第一句接住它。讀者讀完任何一節，都說得出「下一節為什麼存在」。
3. **主線只放做到這一步需要的東西**：版本差異（「Vitest 4 以前…」）、設定檔細節、冷門選項、延伸實務，移到課末的「補充與查表」或「版本備註」；主線只留一句「細節見課末」。
4. **術語先鋪再用**：新名詞在用到之前先用完整的一兩句講清楚它是什麼、解決什麼問題，再開始用。不要在句子中間用括號硬塞定義，例如「CI（持續整合，continuous integration：…）」，這會打斷正在讀的句子。
5. **講透再往下**：一個概念要回答到「它是什麼、為什麼需要、怎麼運作、不這樣做會怎樣、實務上怎麼用」才算講完。寧可多寫幾段把一件事講清楚，也不要一句帶過再跳到下一件事。不預設讀者有基礎。
6. **「💡 實務上」放在一節的結尾**：放在那個概念講完、下一節開始前，不要插在一連串推導中間。內容要接回本課的任務。
7. **自我檢查**：只讀每節的第一句和最後一句，應該能串成一段通順的故事；串不起來就是跳躍。

## 元件

```html
<div class="callout">補充說明</div>
<div class="callout warn">警告：容易出事的地方</div>
<div class="callout practice"><strong>💡 實務上：一句話標題</strong><br>…</div>   <!-- 燈泡區塊，規則見下方 -->

<div class="table-wrap"><table>…</table></div>     <!-- 表格一定要包 table-wrap，手機才不會撐破 -->

<pre>終端機指令或不能執行的程式碼</pre>

<figure>
  <svg viewBox="0 0 700 250" role="img" aria-label="這張圖在說什麼">…</svg>
  <figcaption>圖說</figcaption>
</figure>
```

圖用 inline SVG，顏色只用這些 class，深色模式才會正確：`d-box`（白底框）、`d-soft`（淡色底框）、`d-line`（線）、`d-text`（14px 文字）、`d-small`（12px 灰字）、`d-accent`（強調字）。箭頭用 `<marker>`，`fill="var(--muted)"`。

選擇題：

```html
<div class="quiz" data-correct="b">
  <p>練習 5：題目</p>
  <label data-key="a">選項</label>
  <label data-key="b">選項</label>
  <label data-key="c">選項</label>
  <p class="why">✓ 為什麼 b 對，其他選項錯在哪。</p>
</div>
```

## 練習設計：確保學會

- 題目要讓學習者**自己寫出關鍵的那幾行**，不是照抄範例。同一課裡由引導到獨立。
- 測試要擋得住常見的錯誤寫法：起始程式本身、用 `any` 或型別斷言繞過、寫死輸出、漏掉必要的步驟、只對範例資料有效、改到不該改的東西。把想得到的錯誤寫法放進 `<script type="wrong">`（瀏覽器題）或 `practice/wrong/`（本機題），測試會確認每一個都被判錯。
- 測試的訊息用中文，說清楚要求：`assert.equal(card.stamp(), 1, 'reset 之後要從 1 開始')`。
- 結果要每次都一樣：不依賴真實時間、亂數、網路。需要時間或亂數的題目，讓函式接收 `now()` 或 `random()` 參數，由測試傳入。
- 選擇題針對常見誤解，3–4 個選項，`.why` 解釋對的原因和錯的選項錯在哪。

## 階段檢核

每個階段最後一課的「小結」之後、圖解連結之前，加一節 `<h2>階段檢核：面試會問的觀念</h2>`，放 5～8 題選擇題（`.quiz`）。目的是讓讀者快速確認這個階段的核心觀念真的懂了，面試被問到講得出來。h2 下面先放一句：`<p>這個階段一定要講得出來的 N 件事。先在心裡回答，再選。</p>`。

1. **先列觀念，再出題。** 先定 5～8 個「不懂就不能說學過這個階段」的觀念，一個觀念一題。來源是該階段各課的小結、「💡 實務上」、常見錯誤與階段圖解。依重要性挑：讀者只記得住這幾件事的話，該是哪幾件。前面的課已經用選擇題或實作題考過的觀念照樣要選，換一個情境或角度問；不要為了避開重複而改考次要的細節（特定參數名、選項名）。
2. **不考定義，考判斷。** 題型只用四種：為什麼會這樣（機制）、該選哪個（取捨）、先查什麼（情境診斷）、哪裡會出事（給一小段程式碼或 SQL 找錯）。情境用咖啡店。
3. **錯的選項是面試時真的會有人講的錯誤答案**，不放一眼就能排除的選項。錯選項照做的結果要真的是錯的；只是比較慢、比較醜但結果仍然正確的做法，不能當錯選項。3～4 個選項，各選項長度相近，正解的位置要分散。
4. **`.why` 就是面試時的講法。** 最多 4 個短句：結論、原因、怎麼修（有的話），再點出最多人會選的那一個錯選項錯在哪；其他錯選項不用逐一解釋。結尾標出處「（第 N 課）」。題目敘述最多 2 句；要附程式碼就用 `<pre>` 放在題目與選項之間，10 行以內。
5. 只用這個階段與之前教過的東西。技術說法照課文；課文沒寫而必須新增的，先查對應版本的官方文件。
6. 題號接在該課現有練習之後（`練習 N：`）。題目可以跨課；同一個觀念可以再考，但題目的情境與問法不能跟前面的題目一樣。

## 瀏覽器練習（code.js）

程式在瀏覽器的 module Worker 裡執行：嚴格模式、沒有 DOM、沒有 Node 的 API、不能 import 套件、每題一個檔案、最多跑 3 秒。可以用 `setTimeout`、`Promise`、`AbortController`、`structuredClone`、`TextEncoder`、`crypto.subtle`、`btoa`／`atob`、`Proxy`、`WeakMap` 等。

```html
<div class="lab"><script type="code">
console.log('可以直接按執行的範例，執行後一定要有輸出')
</script></div>

<div class="exercise">
  <p>練習 1：題目說明</p>
  <script type="start">學習者一開始看到的程式</script>
  <script type="answer">標準答案</script>
  <script type="types">隱藏的型別測試（只有 TypeScript 頁）</script>
  <script type="tests">隱藏的執行測試</script>
  <script type="wrong">已知的錯誤寫法（可以有好幾個，學習者看不到）</script>
</div>
```

- **執行測試**：`assert(條件, 訊息)`、`assert.equal(實際, 預期, 訊息)`（`Object.is` 比較）、`assert.deepEqual(實際, 預期, 訊息)`。測試會接在學習者的程式後面、包在 `;{ … }` 區塊裡，可以用頂層 `await`。
- **型別測試**：`type _1 = Expect<Equal<ReturnType<typeof f>, number>>  // 說明`；要報錯的寫法用 `// @ts-expect-error 說明`，下一行寫會出錯的程式。沒通過時，頁面會顯示那一行 `//` 後面的說明。
- **比對輸出**：`<div class="exercise" data-output>`，學習者印出來的內容要跟標準答案印出來的一樣。
- 檢查順序：先只編譯學習者的程式（有型別錯誤就停），再加上型別測試編譯，最後執行。型別錯誤一律以 TypeScript 5.9.3（編輯器內建）和 7.0.2 都相同為準，`tests/ts-parity.mjs` 會檢查。
- 學習者的程式出現 `@ts-nocheck`、`@ts-ignore`、`@ts-expect-error`，或自己宣告名為 `assert` 的東西，引擎直接判錯；`assert` 本身不能被改寫，程式自己 `postMessage` 也假造不了「跑完了」。所以題目不能要求學習者寫這些。
- 頁面需要只有型別、執行時不存在的宣告（例如假套件 `declare module 'coffee-pos' { … }`）時，放一個 `<script type="dts">…</script>`，整頁的編輯器和判分都看得到。
- 程式風格跟現有課程一樣：2 空格縮排、單引號、不加分號。

## HTML／CSS 練習（web.js）

`<div class="exercise web">` 由 `web.js` 處理（code.js 先載好 Monaco 與 TypeScript 再交給它；同一頁可以混 TypeScript 題）。學習者在 Monaco 編輯 HTML／CSS，下方是預覽 `<iframe sandbox="allow-same-origin">`：**沒有 allow-scripts，學習者寫的 `<script>`、`on*` 屬性永遠不會執行**。隱藏測試在課程頁本身執行（helper 也在課程頁），透過同源讀取預覽的 DOM、計算後樣式與版面，學習者改不到。

```html
<div class="exercise web"
  data-doc="body"              body（預設）：學習者寫 body 的內容，引擎補 lang="zh-Hant"、charset、viewport、title「練習」；full：學習者寫整份文件，引擎不補任何東西
  data-edit="html css"         可以編輯的分頁（預設兩者）；不在這裡的部分唯讀顯示，判分一律用原始內容
  data-widths="320 768 1280"   預覽工具列的寬度按鈕；最後一個是預設寬度
  data-height="600"            預覽高度（影響 vh、sticky、首屏）
  data-url="https://brew.example.tw/menu/">   head() 把 href 轉成絕對網址的頁面網址（預設 https://brew.example.tw/）
  <p>練習 1：…</p>
  <script type="start-html">起始 HTML（必須判錯）</script>
  <script type="start-css">起始 CSS</script>
  <script type="fixed-html">唯讀的 HTML（沒有時用 start-html）</script>
  <script type="fixed-css">唯讀的 CSS</script>
  <script type="answer-html">標準答案</script>
  <script type="answer-css">標準答案</script>
  <script type="assets">["latte-480.jpg"]</script>     選用：預覽可以載入的 web/assets/ 檔案，其他一律被 CSP 擋下
  <script type="tests">隱藏測試（TypeScript，只轉譯不做型別檢查）</script>
  <script type="wrong" data-name="說明">{"html": "…", "css": "…"}</script>   已知的錯誤寫法，JSON；缺的一半用標準答案補
</div>
```

- **`<script>` 資料區塊裡不能出現 `</script`**（會提早結束區塊，後面的內容變成課程頁本身的 HTML，裡面的 script 會真的執行）。start／fixed／answer 裡要寫 `<\/script>`，引擎與 pages.mjs 會還原；wrong 的 JSON 字串也寫 `<\/script>`（JSON 的 `\/` 就是 `/`）。也不要在資料區塊裡寫 `<!--`。產生頁面時用程式統一處理最穩：`s.replaceAll('</script', '<\\/script')`。
- 預覽文件：學習者的內容用 DOMParser 解析後，在 head 最前面插入 `<base href="…/web/assets/">` 、CSP（`default-src 'none'`；圖片、字型、影音只允許 `data:` 和 assets 清單裡的檔案；`style-src 'unsafe-inline'` 加 web/assets/；`form-action 'none'`）與基本樣式（font-family，加上匿名 `@layer` 裡標準的 `.visually-hidden`：position absolute、1px、overflow hidden、`clip-path: inset(50%)`、white-space nowrap；不 reset），head 最後面插入 CSS 編輯器的內容。題目不用再自己定義 `.visually-hidden`；匿名 layer 比學習者所有的樣式（含 `@layer`）都弱，學習者或題目自己寫的規則一定贏。這些元素都有 `data-engine`，helper 會略過。學習者的 `<base>`、`<meta http-equiv="refresh">` 會被移除。相對網址都指向 web/assets/。
- srcdoc 文件一律是標準模式（沒寫 doctype 也一樣）；要檢查學習者有沒有寫 doctype、head 裡的原始順序，用 `sourceDoc()`。桌機 Chrome 的 iframe 不套用 viewport meta，viewport 只能用 `head().viewport` 檢查內容。

### 測試的寫法

測試是 TypeScript，整段包在 async 函式裡，頂層可以 `await`。每個 `test(名稱, fn)` 是一個檢查項目，依序執行，全部跑完後列出每一項的 ✓／✗（沒過的顯示錯誤訊息）。訊息用中文，說清楚要求與怎麼修。全部測試合計最多 8 秒，超過就判錯並顯示卡在哪一項。

```ts
test('320px 寬時不會橫向捲動', async () => {
  await preview(320)                       // 每個 test 開頭自己設寬度，不要依賴前一個 test
  assert.equal(overflowX(), 0, `頁面會橫向捲動，撐破的是：${overflowing().map(e => e.localName).join('、')}`)
})
```

| helper | 說明 |
|---|---|
| `preview(w = 1280, h = data-height)` | 設定預覽大小，等兩個 frame、字型、在畫面內的圖片 |
| `doc`、`win` | 預覽的 document、window（重建預覽後自動換成新的）。可以 focus、設表單值、dispatchEvent，不要改學習者的 DOM 結構 |
| `$(sel)`、`$$(sel)` | 在預覽裡查詢（`$$` 回傳陣列） |
| `style(el, prop, pseudo?)` | 計算後樣式，prop 用 CSS 寫法（`'margin-inline-start'`、`'--brand'`） |
| `box(el)`、`docBox(el)` | getBoundingClientRect 四捨五入到 0.5px；docBox 加上捲動量 |
| `overflowX()`、`overflowing()` | 整頁橫向溢出幾 px；超出 viewport 右緣、且沒有被 overflow 容器裁掉的可見元素 |
| `visible(el)` | checkVisibility＋寬高 > 1px＋沒有移到畫面左／上外＋沒被 clip／clip-path 裁掉＋沒被 overflow 容器裁掉＋字級不是 0＋文字跟背景不同色。`.visually-hidden` 是 false。「文字存在」的檢查一律先過它 |
| `tabOrder()` | tabbable 6.5.0 算出的 Tab 順序（displayCheck: 'full'；tabindex > 0 排最前） |
| `focus(el)` | `focus({ focusVisible: true })`，回傳 activeElement；`:focus-visible` 會成立 |
| `focusRing(el)` | 先 blur 量、focus 後再量：`{ outline, boxShadow, changed }`；changed＝outline（≥ 2px）或 box-shadow 跟 blur 時不同，或邊框／背景色改變且對比 ≥ 3 |
| `accName(el)`、`role(el)` | dom-accessibility-api 0.7.1；role 已修正：header／footer 在 article、aside、main、nav、section 裡是 generic，section 沒有名稱是 generic |
| `toRgb(color)`、`contrast(fg, bg)` | 任何顏色字串轉成 [r, g, b, a]；WCAG 對比（沒有四捨五入，`>= 4.5` 直接比）。背景要不透明 |
| `textColors(el)` | `{ color, background }`：往上找第一個不透明背景；遇到 background-image 會丟錯（題目要避開） |
| `axe({ rules? })` | axe-core 4.14.0，在另一個淨化過的 iframe 執行（移除 script、on*、javascript: 網址）。回傳 `{ violations, incomplete }`，每項 `{ id, nodes: selector[] }`。預設跑 wcag2a／2aa／21a／21aa／22aa／best-practice；`rules: ['label']` 只跑指定規則。沒跑完（下載失敗、超過 5 秒）會丟錯，不會當成沒有違規。很慢，一題最多呼叫兩次；incomplete 要明確處理 |
| `head()` | `{ title, lang, charset, viewport, description, robots, canonical[], alternates[], og{}, icons[], preloads[], links[], jsonLd[], jsonLdErrors[] }`，href 都用 data-url 轉成絕對網址；jsonLd 收整份文件的 `application/ld+json` |
| `visibleText(el = body)` | innerText，多個空白合成一個；比對文字時常再 `.replace(/\s+/g, '')`，避免區塊／行內元素造成的空白差異 |
| `sizesAt(img)`、`pickSrc(img, dpr)` | 目前寬度下 sizes 選到的 px；照 HTML 規範從 srcset 選出的網址（回傳屬性裡寫的字串，不讀 currentSrc） |
| `cssRules()` | 學習者樣式攤平：`{ selector, media: string[], layer, props: { 'margin-top': { value, important } } }`。巢狀選擇器展開成完整選擇器；media 是 `'@media (…)'`、`'@container …'`、`'@supports …'` 這類字串；props 是 longhand（寫 `margin` 會變成四個 margin-*）。只在計算樣式量不到時用（例如有沒有 `!important`） |
| `ruleTree()` | 原始巢狀結構 `{ selector \| atRule, depth, children }` |
| `fonts()` | doc.fonts 的 `{ family, display, unicodeRange, status, src }` |
| `sourceTree()`、`domTree()` | 原始碼的開始／結束標籤算出的 `[tag, 深度]` 前序清單（void 元素不加深度，svg 裡的 `/>` 算自己結束）與 DOM 的前序清單 |
| `sourceDoc()` | 用 DOMParser 解析學習者的原始 HTML（不含引擎的元素；沒有 doctype 時 compatMode 是 BackCompat） |
| `emulate({ colorScheme, reducedMotion, hover, pointer, forceStates })` | 重建預覽，把學習者樣式裡對應的 `@media` 條件改成恆真／恆假、同時含 light 與 dark 的 `color-scheme` 改成指定的那個；`forceStates: true` 把 `:hover`→`[data-force-hover]`、`:active`→`[data-force-active]`、`:user-invalid`→`:invalid`、`:user-valid`→`:valid`。`emulate({})` 還原。之後要再 `preview(w)` |
| `render({ assets })` | 用不同的 assets 清單重建預覽（`[]` 讓圖片、字型全部載入失敗） |
| `atWidths([320, 768, 1280], fn)` | 依序設寬度並呼叫 `fn(w)`，錯誤訊息自動加「在 Wpx 寬時：」 |
| `settle()` | 讓有限的 transition／animation 直接跑完；focus、改屬性、emulate 之後讀樣式前呼叫 |
| `assert(v, msg)`、`assert.ok`、`equal`、`notEqual`、`deepEqual`、`match`、`doesNotMatch` | 跟 code.js 一樣的訊息格式 |

### 擋下「看起來對」的寫法

- 版面題至少量兩個寬度（常用 320／768／1280），並檢查 `overflowX() === 0`（WCAG 1.4.10 Reflow 的 320 CSS px）。
- 語意題同時檢查「元素是什麼」與「對使用者有沒有效」：按鈕要 `tagName === 'BUTTON'` 而且 `accName` 正確（擋下 `div role=button`）；連結要 `<a href>`。
- 檢查 `cssRules()` 裡的 `!important`（除非題目允許）；版面元素的 position 要是 static／relative／sticky（擋下用 absolute 硬排）。
- 把 outline 拿掉的寫法，`focusRing(el).changed` 必須仍是 true。
- 文字、關鍵字的存在一律先過 `visible()`；alt、title、description 檢查長度上限與重複詞。
- metadata 用 `head()` 讀 DOM，不用正規表示式讀原始碼；canonical 要恰好一個、是絕對網址；JSON-LD 的欄位要跟 `visibleText()` 一致。
- 測試只讀預覽與唯讀部分的原始內容：寫在 CSS 註解或 HTML 註解裡的答案不會讓任何測試通過。
- `<script type="wrong">` 逐條對應 syllabus 的 mustFail；pages.mjs 會確認起始內容與每個 wrong 都判錯、標準答案判對。

### 已知的限制（寫題目時避開）

- 預覽裡的 `prefers-*` 跟隨作業系統，只能用 `emulate()`（改寫樣式）測；`<link media>`、`<picture><source media>` 裡的 prefers-* 不會被改寫。
- 父頁沒辦法讓元素進入 `:hover`、`:user-invalid`：用 `emulate({ forceStates: true })`。
- 測試可以 `click()` 開 `<details>` 與 popover，但表單不會送出（沒有 allow-forms，CSP 也有 `form-action 'none'`）。
- color-contrast 遇到背景圖或漸層會落到 axe 的 incomplete，題目要用純色背景。
- 外部 origin 的 preload／preconnect 會被 CSP 擋下並在 Console 印錯誤；pages.mjs 會略過來源是 about:srcdoc 的錯誤，`head()` 照樣讀得到。

web 課的本機練習（第 27、28 課）在 `web/practice/`：`node --test`（沒有 vitest.config），套件已裝好 `@playwright/test` 1.64.1、`@axe-core/playwright` 4.14.0、`typescript` 6.0.3、`@types/node` 24.19.2。測試用 `chromium.launch({ channel: 'chrome' })` 用本機的 Chrome，不要 `npx playwright install`；AxeBuilder 的 page 要從 `browser.newContext()` 建立。網站用 `node:http` 在 port 0 提供靜態檔，不連外網。

## PostgreSQL 練習（postgresql/lab.js）

每個資料庫是一個 PGlite 0.5.13（PostgreSQL 18.6），跑在自己的 Web Worker（`postgresql/pg-worker.js`）。每次執行最多 5 秒，超過就當成「在等鎖」：Worker 被終止並顯示原因；卡住的是頁面資料庫就自動重建。`tests/pg-verify.mjs` 直接用 lab.js 的程式判分，和頁面完全相同。

頁面層級：

| 寫法 | 用途 |
|---|---|
| `<script type="text/sql" id="seed">` | 建表與資料，頁面資料庫和每個全新資料庫都會先跑 |
| `<script type="text/sql" id="seed-after">` | seed 之後，用只有 `--;;` 的一行分段，每段各自執行（`VACUUM`、`CREATE INDEX CONCURRENTLY` 這類不能和別的句子放在一起的）；段落第一行是 `-- may fail` 時，出錯只記在 console |
| `<body data-pg-extensions="pg_trgm, btree_gist">` | 載入 PGlite 的 contrib（seed 裡還要 `CREATE EXTENSION`）；`pg_stat_statements` 會自動進 `shared_preload_libraries` |
| `<body data-pg-2pc>` | `max_prepared_transactions = 10`，可以用 `PREPARE TRANSACTION` 模擬另一位同事的交易 |

seed、seed-after 跑完和每次按範例的「執行」之後，引擎會跑一次 `SELECT pg_stat_force_next_flush()`，`pg_stat_*` 才看得到最新計數（`pg_stat_statements` 裡也會出現這一句）。

```html
<div class="lab" data-sql="SELECT 1;"></div>     <!-- 範例：直接改頁面上的資料庫，不會回滾；notices 與 NOTIFY 會顯示在結果上方 -->

<div class="exercise"
  data-start="學習者一開始看到的 SQL"
  data-answer="標準答案"
  data-check="SELECT …（選用：跑完之後用這句的結果判分）"
  data-ordered                 選用：結果的順序也要一樣
  data-isolated                選用：在全新資料庫裡跑（寫到 BEGIN／COMMIT／ROLLBACK 時自動如此）
  data-expect-error="40001"    選用：必須以這個 SQLSTATE 失敗才算對
  data-forbid="\b(DO|RAISE)\b" data-forbid-msg="…"      選用：去掉註解後符合就判錯
  data-require="\bFOR\s+UPDATE\b" data-require-msg="…"  選用：去掉註解後不符合就判錯（訊息不要洩漏答案）
  data-max-statements="1">     選用：超過幾句就判錯
  <p>練習 1：…</p>
  <script type="text/sql" data-role="setup">BEGIN; SELECT … FOR UPDATE; PREPARE TRANSACTION 'worker_a';</script>
  <script type="text/sql" data-role="wrong">已知的錯誤寫法（可以有好幾個；pg-verify 與 pages.mjs 會確認都判錯）</script>
</div>
```

- 範例出錯後交易還開著（已中止）時，引擎只提示學習者執行 `ROLLBACK;`，不會自動回滾：第 18、31 課要讓學習者親眼看到 25P02。
- 一般練習在頁面資料庫的 `BEGIN … ROLLBACK` 裡跑。有 setup 的練習一律在全新資料庫裡跑：seed → seed-after → 每個 setup 各自一次 → 答案或學習者的 SQL → check。
- 同一格（同一次執行）裡寫在 `BEGIN` 之前的句子會被併進那個交易；要先提交的修改放在前一個 setup。
- `VACUUM`、`… CONCURRENTLY`、`COMMIT PREPARED` 不能和別的句子放在同一格，也不能當一般練習的答案（只有一句的 `COMMIT／ROLLBACK PREPARED` 可以）。
- 時間軸：`<div class="tl">`，`tr[data-note]` 逐列播放，寫法照 PostgreSQL 第 19 課。程式在 `course.js`、樣式在 `style.css`，每門課都能用。

## 本機練習（local.js、check.mjs）

需要真的 Node、套件、Docker、資料庫時，練習在學習者自己的電腦上做。流程：學習者在 learn/ 執行 `node check.mjs <課程> <題號>`，它把起始檔複製到 `work/<題號>/`（已經改過的檔案不會被蓋掉），跑測試，把結果寫到 `results/<題號>.json`，課程頁讀這個檔判分。

```
<課程>/practice/
  package.json        "type": "module"；有用到的套件寫在這裡，版本鎖死
  vitest.config.ts    有這個檔就用 Vitest，沒有就用 node --test
  start/05/           起始檔＋測試檔（ex1.test.ts、ex2.test.ts…，一題一個測試檔）
  answer/05/          標準答案（只放跟起始檔不同的檔案）
  wrong/05/ex1-any/   已知的錯誤寫法：蓋在標準答案上，只跑 ex1 的測試，要沒過（資料夾名稱一定是 exN-說明）
  prepare.mjs         （選用）每次跑測試前先執行：node prepare.mjs <work/題號 或 verify/題號-pid-label>，cwd 是 practice/。
                      用來重建這一題的資料庫等；非 0 結束時每一題都算沒過，印出的訊息會顯示在頁面上（要寫清楚怎麼修，例如「先執行 docker compose up -d --wait」）
  work/ results/ verify/   執行時才產生，不進 git
```

課程頁：`<body data-lesson="5" data-practice="node">`，每一題：

```html
<div class="local" data-test="ex1" data-files="ex1.ts">
  <p>練習 1：題目說明（要做什麼、做到什麼程度算完成）</p>
</div>
```

`data-files` 是要改的檔案（空白分隔，相對於 `work/<題號>/`），頁面會自動加上檔案路徑、要執行的指令、測試結果和「看答案」。

練習放在別門課的 practice 時（例如 auth 課用 nestjs/practice），body 加 `data-task="auth21"`，題號資料夾就是 `start/auth21/`。

answer/、wrong/ 是用複製蓋在 start/ 上，只能新增或覆蓋檔案、刪不掉起始檔：要「刪掉」的東西（例如 nestjs 26 的 SharedModule）寫在答案會覆蓋的檔案裡，不要獨立成一個檔。

practice 的設定若從資料夾名稱算資源名稱（nestjs 的 helpers/task.ts：資料庫 `nest_<slug>_test`、Redis 前綴），要同時接受 `work/<題號>` 和 `verify/<題號>-<pid>-<label>`；出題檢查每次的名稱都不同，資料夾不在了要能清掉（nestjs 的 prepare.mjs 每次會刪掉資料夾已經不在的判分資料庫與 Redis key）。

測試規則：

- Node、部署課用 `node:test` 和 `node:assert/strict`；NestJS、Vue 課用 Vitest。檔名 `exN.test.ts`，import 學習者的檔案要寫副檔名（`./ex1.ts`）。
- 測試名稱用中文寫出要求，失敗訊息說明怎麼修。
- 不用固定 port（listen 0，讓系統分配）；開的 server、子程序、容器、計時器都要在測試結束前關掉；Docker 容器、網路、volume 的名稱加上課程和題號，例如 `learn-devops-08-api`。
- 不連外部網路（下載 Docker image 除外）；每次執行結果都一樣；可以重複執行。

## 驗證：交件前一定要跑，全部通過

伺服器已經在 learn/ 開在 8000 port（http://localhost:8000）。在 `tests/` 執行：

```bash
node pages.mjs tests/web-selftest.html             # 改了 web.js 之後：每個 helper 的自我檢查
node pages.mjs <課程>/lessons/NN-slug.html          # 每一課都要：範例、錯答／正解、選擇題、手機寬度（有 HTML／CSS 題時另查 320px）、console 錯誤
node ts-parity.mjs ../<課程>/lessons/NN-slug.html   # TypeScript 的瀏覽器題
node local-verify.mjs <課程> NN                     # 本機練習：題目從課程頁的 data-practice／data-task 找（auth 會檢查 nestjs/practice 的 auth21、auth26）
                                                    # 標準答案跑全部、起始檔每個 exN 要有沒過、wrong/exN-* 只跑 exN 的測試要沒過
                                                    # 每次在 practice/verify/<題號>-<pid>-<label>/ 組程式、跑完就刪，可以同時跑好幾個；被砍掉的檢查留下的資料夾，下次檢查同一個 practice 時會清掉
node pg-verify.mjs ../postgresql/lessons/NN-slug.html   # PostgreSQL 課
node sheets.mjs <課程>                              # 改了 sheets/ 或 STAGES：地圖的圖解連結、每張圖解（深淺色、390px、console、回地圖連結、比課文舊）
```

## 階段的一頁圖解（sheets/）

每門課的每個階段有一頁圖解，從課程地圖的階段標題旁和該階段最後一課的小結後面連過去。改了某課的小結或重點，要一起更新那個階段的圖解。

- 檔案：`<課程>/sheets/stage-N.md`（草稿）與 render 出的 `stage-N.html`（單檔、離線可開），兩個都進 git。N 跟階段名稱的編號一致（PostgreSQL 從 0 開始）。
- `lab.js` 的 `STAGES` 每個階段加第 3 個元素 `'sheets/stage-N.html'`；`course.js` 的 roadmap 有這個元素才顯示「一頁圖解」。
- 階段最後一課的 `<h2>小結</h2>` 清單之後、「下一課」那段之前加：`<p>這個階段的重點整理成<a href="../sheets/stage-N.html">一頁圖解</a>。</p>`。
- 不手寫 HTML、CSS、SVG：只改 `.md`，再 render。
- 每一課頁首的階段名稱後面，會自動出現所屬階段的「一頁圖解」連結：`lab.js` 把 `STAGES` 傳給 `startLesson`／`initLesson`，由 `course.js` 產生，不用在課程頁手寫。

草稿格式（範本：`nestjs/sheets/stage-1.md`）：

```
---
title: NestJS 階段 1：從 Node 到 NestJS
subtitle: 第 1～5 課一頁圖解：骨架、Controller、依賴注入、模組、單元測試
cols: 3
theme: shadcn
課程: NestJS 第 1～5 課
---
一句結論。[回 NestJS 學習地圖](../index.html)

## A 面板標題 {span=2}
```

- 6～8 個面板，每個只回答一個問題；階段裡每一課至少出現一次（只有一課的階段 6 個即可）。
- 關係用 flow／sequence／er，比較用表格（狀態欄開頭寫 ok／no／warn），結論或警告用 callout；kv、tree、timeline 也可以。
- 內容只能來自該階段的課文（以小結為主）。不編造數字、API、狀態碼、版本行為；只在某課示範資料成立的數字要寫明「這課的示範」；不要說得比課文肯定；不要把期末課的總結套到前面的階段。
- 用語照下方「用語」。

工具的已知陷阱：
- 面板標題第一個字是小寫英文會被讀錯（`## E provider…` 變成標題「E provider…」），用中文或大寫開頭。
- er 的欄位不能同時標 PK 和 FK，複合主鍵寫在圖下方文字。
- flow 節點文字有冒號、括號、角括號時容易出錯，用 `[ ]` 包起來或改寫。
- STE 檢查會把「登出」標成建議改「退出登录」，是誤報，保留。

Render：在 `tests/` 執行

```bash
node sheets-render.mjs nestjs 1 2   # render nestjs 的 stage-1、stage-2；不給階段號就 render 整門課，--all 是所有課程
node sheets.mjs nestjs              # 檢查
```

`sheets-render.mjs` 把 answer-me-with-html 固定在 0.5.10（commit `406ef8d`，MIT，Node 20 以上，不用 npm install），第一次執行時 clone 到系統暫存目錄，工具的工作資料也放在暫存目錄。出現 `✗` 或 flow 交叉警告就改草稿再 render；STE 用字提醒只是提醒。看語法：`node <暫存目錄>/answer-me-with-html-406ef8d/skills/answer-me-with-html/scripts/am.mjs help format`（也有 help flow、sequence、er …）。

主題一律 `theme: shadcn`（寫在 frontmatter）：無襯線字、藍色強調、圓角卡片，最接近課程頁的樣子；頁面右上角仍可切換主題與深淺色。所有圖解的總表在 `sheets.html`，從首頁連過去，由各課 `STAGES` 自動產生。

## 用語

繁體中文、台灣用語：程式、資料、伺服器、預設、物件、陣列、字串、函式、變數、參數、套件、檔案、資料夾、專案、記憶體、執行緒、程序（process）、網路、訊息、設定、介面、使用者、登入、快取、佇列、迴圈、呼叫、執行、回傳、部署、容器、映像（image）。

不要用：數據（→資料）、默認（→預設）、服務器（→伺服器）、對象（→物件）、函數（→函式）、變量（→變數）、項目（→專案）、文件（指 file 時→檔案）、信息（→訊息）、網絡（→網路）、線程（→執行緒）、進程（→程序）、緩存（→快取）、隊列（→佇列）、端口（→port）、調用（→呼叫）、運行（→執行）、配置（→設定）、打印（→印出）、字符串（→字串）、數組（→陣列）、循環（→迴圈）、質量（→品質）、用戶（→使用者）。

## 咖啡店資料

所有課程共用同一間咖啡店，和 PostgreSQL 課第 25 課的資料一致：

- 商品：美式咖啡 80、拿鐵 110、卡布奇諾 110、伯爵紅茶 90、可頌 70、起司蛋糕 120（元）
- 顧客：王小明、陳美華、林志豪、張雅婷、李建國、黃淑芬
- 表：`customers`、`products`、`orders`（`customer_id`、`ordered_at`、`total`）、`order_items`（`order_id`、`product_id`、`quantity`、`unit_price`）
