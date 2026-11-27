// 程式練習引擎（JavaScript、TypeScript）：Monaco 編輯器（內建 TypeScript）、在 Worker 裡執行、自動判分
// 課程頁：<body data-lesson="N">；整頁寫 JavaScript 加 data-lang="js"；要改編譯選項加 data-ts='{"experimentalDecorators":true}'
// 範例：<div class="lab"><script type="code">…</script></div>
// 頁面型別宣告：<script type="dts">（放在 body 任何地方，加進型別檢查，不會執行）
// HTML／CSS 題：<div class="exercise web">，由 web.js 處理（寫法見 web.js 開頭）
// 題目：<div class="exercise">，裡面放 <script type="start|answer|types|tests|wrong">（瀏覽器不會執行這些 type）
//   types：隱藏的型別測試　tests：隱藏的執行測試　wrong：已知的錯誤寫法，只給 tests/ 的檢查用，必須判錯
//   加 data-output 的題目改成比對印出來的內容
import { el } from './course.js'

const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs'

// 編輯器與判分共用的 TypeScript 設定。tests/ts-parity.mjs 的 tsconfig 要跟這裡一致
const COMPILER = {
  target: 9,            // ES2022（Monaco 的列舉沒有這個值，只能寫數字）
  module: 99,           // ESNext
  moduleDetection: 3,   // force：每個編輯器都是獨立的模組，變數名稱不會互撞
  strict: true,
  lib: ['lib.es2024.d.ts', 'lib.webworker.d.ts'],   // 程式在 Worker 裡跑，所以沒有 DOM
  allowNonTsExtensions: true,
}

const ERROR_HINTS = {
  1005: '語法錯誤：少了括號、逗號，或某個符號沒有成對。',
  2304: '找不到這個名稱：拼錯了，還是還沒宣告？',
  2322: '型別不符：這個值不能放進那個型別的位置。',
  2339: '這個型別上沒有這個屬性：拼錯了，還是型別寫得不夠精確？',
  2345: '傳進函式的參數，型別跟函式要求的不一樣。',
  2353: '物件多了型別裡沒有的屬性：欄位名稱拼錯了？',
  2367: '這兩個值的型別不可能相等，所以這個比較永遠不成立。',
  2551: '這個屬性不存在，TypeScript 猜你要寫的是訊息裡 Did you mean 後面那個。',
  2552: '這個名稱不存在，TypeScript 猜你要寫的是訊息裡 Did you mean 後面那個。',
  2554: '傳進函式的參數數量不對。',
  2588: 'const 宣告的變數不能重新指定值。',
  2741: '物件少了型別要求的屬性。',
  7006: '參數沒有寫型別，TypeScript 也推不出來，就變成 any；strict 模式不允許。',
  18046: '型別是 unknown：用之前要先檢查它到底是什麼。',
  18047: '這個值可能是 null：用之前要先檢查。',
  18048: '這個值可能是 undefined：用之前要先檢查。',
}

// ---------- 執行：每次開一個全新的 Worker，跑完或超過 3 秒就關掉 ----------
// 這個函式會整段轉成文字放進 Worker 執行，所以不能用到函式外面的任何東西
function runner() {
  // 學習者的程式可能自己呼叫 postMessage 假裝跑完，所以每則訊息都帶頁面給的暗號
  const post = postMessage.bind(self)
  let key
  const send = (t, s) => post({ t, s, key })
  // 印出來的格式接近 Node 的 console.log。
  // 練習可能暫時換掉 Map、Set 或陣列方法（禁止使用），所以這裡先記住原本的建構子，seen 也只用索引操作
  const { Map: RealMap, Set: RealSet } = self
  const fmt = (v, top = true, seen = []) => {
    if (typeof v === 'string') return top ? v : `'${v}'`
    if (typeof v === 'function') return /^class\b/.test(Function.prototype.toString.call(v)) ? `[class ${v.name || '(anonymous)'}]` : `[Function: ${v.name || '(anonymous)'}]`
    if (typeof v === 'bigint') return v + 'n'
    if (typeof v === 'symbol') return v.toString()
    if (v === null || typeof v !== 'object') return String(v)
    for (let i = 0; i < seen.length; i++) if (seen[i] === v) return '[Circular]'
    seen[seen.length] = v
    try {
      const f = x => fmt(x, false, seen)
      if (v instanceof Error) return `${v.name}: ${v.message}`
      if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString()
      if (v instanceof RegExp) return String(v)
      if (v instanceof Promise) return 'Promise {}'
      if (Array.isArray(v)) return v.length ? `[ ${v.map(f).join(', ')} ]` : '[]'
      if (v instanceof RealMap) return `Map(${v.size}) {${v.size ? ` ${[...v].map(([k, x]) => `${f(k)} => ${f(x)}`).join(', ')} ` : ''}}`
      if (v instanceof RealSet) return `Set(${v.size}) {${v.size ? ` ${[...v].map(f).join(', ')} ` : ''}}`
      const name = v.constructor && v.constructor !== Object ? v.constructor.name + ' ' : ''
      // getter 不呼叫（跟 Node 一樣印 [Getter]），印東西不該執行到別的程式
      const body = Object.entries(Object.getOwnPropertyDescriptors(v)).filter(([, d]) => d.enumerable)
        .map(([k, d]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${'value' in d ? f(d.value) : '[Getter]'}`)
      return name + (body.length ? `{ ${body.join(', ')} }` : '{}')
    } finally { seen.length-- }
  }
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table']) console[k] = (...a) => send(k, a.map(x => fmt(x)).join(' '))

  // 記住還沒觸發的計時器，全部跑完才算執行結束。callback 的 this 跟原生一樣是全域物件
  const timers = new Set()
  const { setTimeout: st, clearTimeout: ct, setInterval: si, clearInterval: ci } = self
  self.setTimeout = (fn, ms, ...a) => {
    if (typeof fn !== 'function') throw new TypeError('setTimeout 的第一個參數要是函式')
    const id = st(() => { timers.delete(id); fn.apply(self, a) }, ms)
    timers.add(id)
    return id
  }
  self.clearTimeout = id => { timers.delete(id); ct(id) }
  self.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); timers.add(id); return id }
  self.clearInterval = id => { timers.delete(id); ci(id) }

  // 判分用的 assert：不成立就丟出錯誤，訊息會顯示在頁面上
  class AssertionError extends Error { name = 'AssertionError' }
  const eq = (a, b) => {
    if (Object.is(a, b)) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
    if (a instanceof Date) return a.getTime() === b.getTime()
    if (a instanceof RegExp) return String(a) === String(b)
    if (a instanceof Set) return a.size === b.size && [...a].every(x => [...b].some(y => eq(x, y)))
    if (a instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && eq(v, b.get(k)))
    if (a instanceof Error && (a.name !== b.name || a.message !== b.message)) return false
    if (Array.isArray(a) && a.length !== b.length) return false
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && eq(a[k], b[k]))
  }
  const fail = (msg, actual, expected) => { throw new AssertionError(`${msg ? msg + '：' : ''}預期 ${fmt(expected, false)}，實際是 ${fmt(actual, false)}`) }
  const assert = (value, msg) => { if (!value) throw new AssertionError(msg ?? '條件不成立') }
  assert.equal = (actual, expected, msg) => Object.is(actual, expected) || fail(msg, actual, expected)
  assert.deepEqual = (actual, expected, msg) => eq(actual, expected) || fail(msg, actual, expected)
  // 不能被換掉：學習者的程式改寫 assert 會直接出錯
  Object.defineProperty(self, 'assert', { value: Object.freeze(assert), writable: false, configurable: false })

  // 沒接住的錯誤（包含 assert 不成立）和沒處理的 Promise rejection
  self.addEventListener('error', e => { e.preventDefault(); send('uncaught', 'Uncaught ' + fmt(e.error ?? e.message)) })
  self.addEventListener('unhandledrejection', e => { e.preventDefault(); send('uncaught', 'Uncaught (in promise) ' + fmt(e.reason)) })

  self.onmessage = async ({ data }) => {
    key = data.key
    self.onmessage = null
    try { await import(URL.createObjectURL(new Blob([data.js], { type: 'text/javascript' }))) }
    catch (e) { send('uncaught', 'Uncaught ' + fmt(e)) }
    // 等計時器都觸發完，再多等一下，讓最後的 Promise 和 unhandledrejection 送出來；這段時間又排了計時器就繼續等
    const wait = () => timers.size ? st(wait, 10) : st(() => timers.size ? wait() : send('done'), 30)
    wait()
  }
}

let runnerUrl
function execute(js) {
  runnerUrl ??= URL.createObjectURL(new Blob([`(${runner})()`], { type: 'text/javascript' }))
  return new Promise(resolve => {
    const lines = []
    // 一般 HTTP 也能產生安全暗號，不依賴限定安全環境的 randomUUID。
    const key = crypto.getRandomValues(new Uint32Array(4)).join('-')
    const w = new Worker(runnerUrl, { type: 'module' })
    const end = timedOut => { clearTimeout(timer); w.terminate(); resolve({ lines, timedOut }) }
    const timer = setTimeout(() => end(true), 3000)
    // 無限迴圈裡的 console.log 會灌爆頁面，超過 1000 行就停
    w.onmessage = ({ data }) => {
      if (data?.key !== key) return
      if (data.t === 'done') return end(false)
      if (lines.push(data) >= 1000) {
        lines.push({ t: 'uncaught', s: '輸出超過 1000 行，已強制停止：可能是無限迴圈。' })
        end(false)
      }
    }
    w.onerror = e => { lines.push({ t: 'uncaught', s: e.message || '程式沒辦法啟動' }); end(false) }
    w.postMessage({ js, key })
  })
}

// ---------- 編輯器與 TypeScript ----------
let ts       // 這一頁寫 TypeScript（true）還是 JavaScript
let seq = 0
const EXT = { typescript: 'ts', javascript: 'js', html: 'html', css: 'css' }
const newModel = (code, lang) => monaco.editor.createModel(code, lang, monaco.Uri.parse(`file:///f${++seq}.${EXT[lang]}`))

function loadMonaco() {
  return new Promise((resolve, reject) => {
    const s = el('script')
    s.src = MONACO + '/loader.js'
    s.onerror = () => reject(new Error('下載不了編輯器，檢查一下網路'))
    s.onload = () => {
      require.config({ paths: { vs: MONACO } })
      require(['vs/editor/editor.main'], resolve, reject)
    }
    document.head.append(s)
  })
}

const flatten = m => typeof m === 'string' ? m : [m.messageText, ...(m.next ?? []).map(flatten)].join('\n  ')

// 把一段 TypeScript 放進暫時的 model：回傳型別錯誤（在第幾行）和轉好的 JavaScript
export async function compile(code) {
  const model = newModel(code, 'typescript')
  try {
    const worker = await (await monaco.typescript.getTypeScriptWorker())(model.uri)
    const f = model.uri.toString()
    const diags = [...await worker.getSyntacticDiagnostics(f), ...await worker.getSemanticDiagnostics(f)].filter(d => d.category === 1)
    const errors = diags.map(d => ({ line: model.getPositionAt(d.start ?? 0).lineNumber, code: d.code, text: flatten(d.messageText) }))
    const js = (await worker.getEmitOutput(f)).outputFiles[0]?.text ?? ''
    return { errors, js }
  } finally {
    model.dispose()
  }
}
const toJs = async code => ts ? (await compile(code)).js : code

// lang：預設跟著整頁（typescript／javascript）；web.js 用 'html'、'css'，唯讀分頁加 readOnly
export function makeEditor(box, code, lang = ts ? 'typescript' : 'javascript', readOnly = false) {
  const wrap = el('div', 'editor')
  box.append(wrap)
  const editor = monaco.editor.create(wrap, {
    model: newModel(code, lang), readOnly,
    fontSize: 14, fontFamily: 'ui-monospace, Menlo, monospace', tabSize: 2,
    minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on', wrappingIndent: 'indent',
    overviewRulerLanes: 0, lineNumbersMinChars: 3, renderLineHighlight: 'none', stickyScroll: { enabled: false },
    // 高度跟著內容長，不需要垂直捲軸；滾輪留給頁面捲動
    scrollbar: { vertical: 'hidden', alwaysConsumeMouseWheel: false }, fixedOverflowWidgets: true, padding: { top: 8, bottom: 8 },
  })
  // 編輯器的高度跟著程式碼行數長
  const fit = () => { wrap.style.height = editor.getContentHeight() + 'px' }
  editor.onDidContentSizeChange(fit)
  fit()
  return editor
}
const onCtrlEnter = (editor, run) => editor.addAction({ id: 'run', label: '執行', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run })

// ---------- 顯示結果 ----------
function renderLines(out, { lines, timedOut }) {
  const con = el('div', 'console')
  for (const { t, s } of lines) con.append(el('div', t === 'uncaught' || t === 'error' ? 'err' : t === 'warn' ? 'warn' : null, s))
  if (timedOut) con.append(el('div', 'err', '⏱ 執行超過 3 秒，已強制停止：可能是無限迴圈、setInterval 沒有清掉，或 await 在等一個永遠不會完成的 Promise。'))
  if (!con.childElementCount) con.append(el('div', 'muted', '（沒有輸出）'))
  out.append(con)
}

function renderErrors(out, title, errors) {
  out.append(el('div', 'error', title + '\n' + errors.map(e => `第 ${e.line} 行：${e.text}（TS${e.code}）`).join('\n')))
  for (const code of new Set(errors.map(e => e.code))) if (ERROR_HINTS[code]) out.append(el('div', 'hint', '💡 ' + ERROR_HINTS[code]))
}

// 「執行」：TypeScript 有型別錯誤也照樣轉成 JS 執行，錯誤列在上面
async function runCode(code, out) {
  out.replaceChildren()
  if (!ts) return renderLines(out, await execute(code))
  const { errors, js } = await compile(code)
  if (errors.length) renderErrors(out, '型別錯誤（JS 照樣產生、照樣執行）：', errors)
  renderLines(out, await execute(js))
}

// ---------- 頁面元件 ----------
const part = (box, type) => (box.querySelector(`script[type="${type}"]`)?.textContent ?? '').replace(/^\n+|\s+$/g, '')
const block = tests => tests ? `\n;{\n${tests}\n}` : ''
// 比對輸出只看印出來的文字，不管用的是 console.log 還是 console.info
const printed = r => [r.timedOut, ...r.lines.flatMap(l => l.s.split('\n'))].join('\n')
// 型別測試沒過時，顯示那一行 // 後面的說明；沒寫說明就顯示那一行程式
const describe = line => line.match(/\/\/\s*(?:@ts-expect-error\s*)?(.+)$/)?.[1] ?? line.trim()
// 學習者的程式不能關掉型別檢查，也不能自己宣告一個 assert 蓋掉判分用的
const cheat = code => ts && /@ts-(nocheck|ignore|expect-error)\b/.test(code) ? '不能用 @ts-nocheck、@ts-ignore、@ts-expect-error 關掉型別檢查，請把型別錯誤真的改好。'
  : /\b(const|let|var|function|class)\s+assert\b|\bas\s+assert\b|\bimport\s+assert\b/.test(code) ? '不能自己宣告名為 assert 的東西：那是判分用的。' : ''

function setupLab(box) {
  const editor = makeEditor(box, part(box, 'code'))
  const run = el('button', 'primary', '執行 ▶')
  const out = el('div', 'out')
  const go = async () => { run.disabled = true; try { await runCode(editor.getValue(), out) } finally { run.disabled = false } }
  run.onclick = go
  onCtrlEnter(editor, () => run.click())
  const bar = el('div', 'bar')
  bar.append(run, el('span', 'kbd', '⌘/Ctrl + Enter'))
  box.append(bar, out)
}

// 判分：TypeScript 先檢查型別（含隱藏的型別測試），再執行（含隱藏的執行測試）；
// 有 data-output 的題目改成比對輸出，跟標準答案印出來的一樣才算對
function setupExercise(box, onPass) {
  const [start, answer, types, tests] = ['start', 'answer', 'types', 'tests'].map(t => part(box, t))
  const editor = makeEditor(box, start)
  const run = el('button', null, '執行')
  const check = el('button', 'primary', '檢查答案')
  const out = el('div', 'out')
  const verdict = el('div', 'verdict')
  const shown = el('details')
  shown.append(el('summary', null, '看答案'), el('pre', null, answer))
  const bar = el('div', 'bar')
  bar.append(run, check, el('span', 'kbd', '⌘/Ctrl + Enter 檢查'))
  box.append(bar, out, verdict, shown)

  const busy = async fn => { run.disabled = check.disabled = true; try { await fn() } finally { run.disabled = check.disabled = false } }
  const judge = (ok, text) => {
    verdict.className = 'verdict ' + (ok ? 'pass' : 'fail')
    verdict.textContent = (ok ? '✓ ' : '✗ ') + text
    if (ok) onPass(box)
  }
  const clear = () => {
    out.replaceChildren()
    verdict.className = 'verdict'
    verdict.textContent = ''
  }
  run.onclick = () => busy(() => { clear(); return runCode(editor.getValue(), out) })
  check.onclick = () => busy(async () => {
    const code = editor.getValue()
    clear()
    const bad = cheat(code)
    if (bad) return judge(false, bad)
    if (ts) {
      // 先只檢查學習者的程式，錯誤才不會被算到隱藏測試頭上
      const own = await compile(code)
      if (own.errors.length) {
        renderErrors(out, '型別錯誤：', own.errors)
        return judge(false, '還有型別錯誤，看上面的訊息。')
      }
      const full = code + '\n' + types + block(tests)
      const { errors } = await compile(full)
      if (errors.length) {
        const lines = full.split('\n')
        const failed = [...new Set(errors.map(e => describe(lines[e.line - 1])))]
        out.append(el('div', 'error', '沒通過的型別檢查：\n' + failed.map(s => '・' + s).join('\n')))
        return judge(false, '型別跟題目要求的不一樣。')
      }
    }
    const result = await execute(await toJs(code + block(tests)))
    renderLines(out, result)
    if ('output' in box.dataset) {
      const want = await execute(await toJs(answer))
      return printed(result) === printed(want)
        ? judge(true, '正確！') : judge(false, '輸出跟預期不一樣，對照一下題目再試試。')
    }
    if (result.timedOut || result.lines.some(l => l.t === 'uncaught')) return judge(false, '有測試沒通過，看上面的訊息。')
    judge(true, '正確！')
  })
  onCtrlEnter(editor, () => check.click())
}

export async function initCode(onPass) {
  ts = document.body.dataset.lang !== 'js'
  const status = el('div', 'engine-status', '⏳ 正在載入編輯器…')
  document.querySelector('header').append(status)
  try {
    await loadMonaco()
    const defaults = monaco.typescript[ts ? 'typescriptDefaults' : 'javascriptDefaults']
    defaults.setCompilerOptions({ ...COMPILER, ...(ts ? {} : { allowJs: true }), ...JSON.parse(document.body.dataset.ts ?? '{}') })
    defaults.setDiagnosticsOptions({ onlyVisible: true })
    if (ts) defaults.addExtraLib(await (await fetch(new URL('globals.d.ts', import.meta.url))).text(), 'file:///globals.d.ts')
    // 頁面自己的型別宣告（例如只有型別、執行時不存在的假套件 declare module 'x' { … }）
    const dts = document.querySelector('script[type="dts"]')
    if (dts) defaults.addExtraLib(dts.textContent, 'file:///page.d.ts')
    const dark = matchMedia('(prefers-color-scheme: dark)')
    monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs')
    dark.onchange = e => monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs')
    document.querySelectorAll('.lab').forEach(setupLab)
    document.querySelectorAll('.exercise:not(.web)').forEach(b => setupExercise(b, onPass))
    // HTML／CSS 題（web.js）共用這裡載好的 Monaco 與 TypeScript（用來轉譯隱藏測試）
    if (document.querySelector('.exercise.web')) (await import('./web.js')).initWeb(onPass)
    if (ts) await compile('')   // 先把 TypeScript 叫起來，第一次按「檢查」才不用等
    status.textContent = ts
      ? `✓ TypeScript ${monaco.typescript.typescriptVersion} 已就緒（程式在這個分頁裡執行）`
      : '✓ 編輯器已就緒（程式在這個分頁裡執行）'
  } catch (e) {
    status.textContent = '✗ 載入失敗：' + (e?.message ?? e)
  }
}
