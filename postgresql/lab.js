// PostgreSQL 課的引擎：課程清單、瀏覽器內 PostgreSQL（PGlite）、SQL 練習區、自動判分
import { el, initLesson } from '../course.js'

const PGLITE_URL = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.13/dist/index.js'

export const KEY = 'pg-progress'
export const STAGES = [
  ['階段 0：基本觀念', [
    [1, '資料庫是什麼', '01-what-is-db.html'],
    [2, '表、列、欄、主鍵', '02-tables.html'],
  ], 'sheets/stage-0.html'],
  ['階段 1：CRUD（增查改刪）', [
    [3, '新增資料：INSERT', '03-insert.html'],
    [4, '查詢入門：SELECT、WHERE、NULL', '04-select.html'],
    [5, '排序與分頁：ORDER BY、LIMIT', '05-order-limit.html'],
    [6, '修改與刪除：UPDATE、DELETE', '06-update-delete.html'],
    [7, '統計：COUNT、SUM、GROUP BY', '07-aggregate.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：表與表之間的關係', [
    [8, '一對多與外鍵', '08-foreign-keys.html'],
    [9, 'JOIN：把表接起來', '09-joins.html'],
    [10, '多對多：中間表', '10-many-to-many.html'],
    [11, '正規化：為什麼要拆表', '11-normalization.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：資料品質', [
    [12, '約束：NOT NULL、UNIQUE、CHECK', '12-constraints.html'],
    [13, '選對資料型別', '13-data-types.html'],
    [14, 'JSONB 與陣列', '14-jsonb-arrays.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：進階查詢', [
    [15, '常用函式：字串、日期、CASE', '15-functions.html'],
    [16, '子查詢與 CTE', '16-subquery-cte.html'],
    [17, '視窗函式', '17-window-functions.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：正確性', [
    [18, '交易：BEGIN、COMMIT、ROLLBACK', '18-transactions.html'],
    [19, '並發與鎖', '19-concurrency.html'],
  ], 'sheets/stage-5.html'],
  ['階段 6：效能', [
    [20, '索引', '20-indexes.html'],
    [21, 'EXPLAIN：讀懂查詢計畫', '21-explain.html'],
  ], 'sheets/stage-6.html'],
  ['階段 7：實務', [
    [22, '改 schema 與 migration', '22-migrations.html'],
    [23, 'View、Function、Trigger', '23-views-functions-triggers.html'],
    [24, '權限與 Row Level Security', '24-rls.html'],
    [25, '從後端程式連資料庫', '25-backend.html'],
    [26, '期末專題（基礎篇）', '26-capstone.html'],
  ], 'sheets/stage-7.html'],
  ['階段 8：資深必備｜查詢效能', [
    [27, '索引設計進階：複合、部分、運算式與覆蓋索引', '27-index-design.html'],
    [28, 'GIN 與搜尋：JSONB、全文檢索、模糊搜尋', '28-gin-search.html'],
    [29, '查詢調校：統計資訊、執行計畫與慢查詢', '29-query-tuning.html'],
  ], 'sheets/stage-8.html'],
  ['階段 9：資深必備｜並發與正確性', [
    [30, 'MVCC 內部：列的版本、VACUUM 與表膨脹', '30-mvcc-vacuum.html'],
    [31, '隔離等級深入：快照、寫入偏差、重試與 UPSERT', '31-isolation-upsert.html'],
    [32, '鎖深入：鎖等級、等待佇列、死結與診斷', '32-locks.html'],
    [33, '用 PostgreSQL 做工作佇列：SKIP LOCKED、advisory lock 與 outbox', '33-job-queue.html'],
  ], 'sheets/stage-9.html'],
  ['階段 10：資深必備｜上線與維運', [
    [34, '零停機 migration：DDL 的鎖與安全步驟', '34-zero-downtime-migrations.html'],
    [35, '分割表與大表：分區、BRIN、資料保留', '35-partitioning.html', '選修'],
    [36, '連線、權限與監控：資料庫的上線設定', '36-connections-monitoring.html'],
    [37, '備份、還原、複寫與高可用', '37-backup-replication.html'],
  ], 'sheets/stage-10.html'],
  ['階段 11：資深必備｜資料建模與期末專題', [
    [38, '資料建模模式：軟刪除、稽核、時間區間、多租戶', '38-modeling-patterns.html'],
    [39, '資深期末專題：上線前審查與事故演練', '39-senior-capstone.html'],
  ], 'sheets/stage-11.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

const ERROR_HINTS = {
  '42601': '語法錯誤：檢查拼字、逗號、括號、引號，或句尾少了分號。',
  '42P01': '找不到這張表：表名拼錯了，或是還沒建立？',
  '42703': '找不到這個欄位：欄位名稱拼錯了？',
  '42P07': '這張表已經存在了。',
  '23505': '值重複了：主鍵或 UNIQUE 欄位不能有兩筆一樣的值。',
  '23502': '這個欄位不能是空的（NOT NULL）。',
  '22P02': '型別不符：例如把文字放進數字欄位。',
  '23503': '外鍵：參照的資料不存在，或還有別的資料參照它。',
  '23514': '違反 CHECK 規則：這個值不符合欄位設定的條件。',
  '428C9': '這個欄位由資料庫自動產生（IDENTITY），不能自己填值。',
  '25001': '這句不能在交易裡執行：多句寫在同一格會被當成一個交易，把它單獨放一格。',
  '40001': '序列化失敗：跟另一個交易衝突了，實務上要從 BEGIN 開始重試整個交易。',
  '40P01': '死結（deadlock）：兩個交易互相等對方的鎖，PostgreSQL 讓其中一個失敗。',
  '55P03': '拿不到鎖（NOWAIT 或 lock_timeout）：這一列或這張表正被別的交易鎖著。',
}


// ---------- 資料庫：每個 PGlite 跑在自己的 Worker（pg-worker.js），每次呼叫都有逾時 ----------
// 瀏覽器從 CDN 載入 PGlite；Node（tests/）用 tests/node_modules 裡同一個版本
const PGLITE_BASE = globalThis.document
  ? 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.13/dist/'
  : new URL('../tests/node_modules/@electric-sql/pglite/dist/', import.meta.url).href
const WORKER_URL = new URL('./pg-worker.js', import.meta.url)
export const EXEC_MS = 5000      // 每次 exec／query
export const CREATE_MS = 60000   // 載入 PGlite＋擴充＋seed
const LOCK_MSG = '這句 SQL 在等鎖：鎖被另一個（PREPARE 的）交易拿著。單一連線裡沒有人能放開它，所以會永遠等下去；真實資料庫裡它會等到對方 COMMIT／ROLLBACK，或 lock_timeout 到期。'
const ARR = { rowMode: 'array' }  // 同名欄位（JOIN 常見）不會互相覆蓋

// page：{ seed, seedAfter, extensions, twoPc }。回傳的 d 有 exec(sql, opts)、query(sql, params, opts)、inTx()、close()；
// 逾時就 terminate Worker、d.dead = true、呼叫 d.onDead（頁面資料庫用它重建）
export async function openDb(page) {
  const w = globalThis.Worker
    ? new Worker(WORKER_URL, { type: 'module' })
    : new (await import('node:worker_threads')).Worker(WORKER_URL)
  const pending = new Map()
  let n = 0
  const d = { dead: false, onDead: null }
  const done = (id, err, m) => {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    clearTimeout(p.t)
    err ? p.rej(err) : p.res(m)
  }
  const onMsg = m => done(m.id, m.error && Object.assign(new Error(m.error.message), m.error, { msgs: m.msgs }), m)
  const onCrash = e => { for (const id of [...pending.keys()]) done(id, new Error('PostgreSQL 引擎當掉了：' + e.message)) }
  if (w.on) { w.on('message', onMsg); w.on('error', onCrash) } else { w.onmessage = e => onMsg(e.data); w.onerror = e => { e.preventDefault(); onCrash(e) } }
  d.close = () => {
    d.dead = true
    w.terminate()
    for (const id of [...pending.keys()]) done(id, new Error('資料庫已關閉'))
  }
  const call = (msg, ms = EXEC_MS, timeoutMsg = LOCK_MSG) => new Promise((res, rej) => {
    if (d.dead) return rej(new Error('資料庫已關閉'))
    const id = ++n
    const t = setTimeout(() => {
      done(id, Object.assign(new Error(timeoutMsg), { code: 'TIMEOUT' }))
      d.close()
      d.onDead?.()
    }, ms)
    pending.set(id, { res, rej, t })
    w.postMessage({ id, ...msg })
  })
  d.exec = async (sql, opts = {}) => { const m = await call({ op: 'exec', sql, ...opts }); return Object.assign(m.value, { msgs: m.msgs }) }
  d.query = async (sql, params, opts = {}) => (await call({ op: 'query', sql, params, ...opts })).value
  d.inTx = async () => (await call({ op: 'inTx' })).value
  try {
    d.version = (await call({ op: 'create', base: PGLITE_BASE, ...page }, CREATE_MS, '啟動逾時：PostgreSQL 或擴充套件載入太久。')).value
  } catch (e) {
    d.close()
    throw e
  }
  return d
}

// ---------- 判分（瀏覽器和 tests/pg-verify.mjs 共用） ----------
// spec 就是練習框的 dataset：answer、check、ordered、isolated、expectError、forbid、forbidMsg、require、requireMsg、maxStatements，
// 加上 setups（data-role="setup" 的 script 內容）
const TX = /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|START\s+TRANSACTION)\b/i
// 練習框有 setup、data-isolated，或學習者寫了交易指令（自己 COMMIT 會跳出外層的 BEGIN…ROLLBACK）時，改在全新資料庫裡跑
export const isIsolated = (spec, sql) => 'isolated' in spec || !!spec.setups?.length || TX.test(sql)
// ponytail: 去註解不理會字串裡的 -- 與 /*，題目的 require／forbid 正則別依賴字串內容
const stripComments = sql => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')

// 執行學習者（或標準答案）的 SQL；回傳 { res: 這段 SQL 的結果, final: check 的結果（沒有 check 就是 res） }
// closed：判分時，學習者的交易必須已經 COMMIT 或 ROLLBACK
export async function sandbox(page, db, spec, sql, iso, closed) {
  if (iso) {
    const d = await openDb(page)
    try {
      for (const s of spec.setups ?? []) {
        try { await d.exec(s) } catch (e) { throw new Error('練習的 setup 執行失敗（題目設定有問題）：' + e.message) }
      }
      const res = await d.exec(sql, ARR)
      if (closed && await d.inTx()) throw new Error('交易還沒結束：最後要用 COMMIT（確定生效）或 ROLLBACK（取消）結束交易。')
      return { res, final: spec.check ? await d.exec(spec.check, ARR) : res }
    } finally {
      d.close()
    }
  }
  // 在交易裡跑、跑完 ROLLBACK，判分不會改到頁面上的資料
  await db.exec('BEGIN')
  try {
    const res = await db.exec(sql, ARR)
    return { res, final: spec.check ? await db.exec(spec.check, ARR) : res }
  } finally {
    if (!db.dead) await db.exec('ROLLBACK')
  }
}

// 只比對「值」，不比對欄位名稱；沒有要求順序時先排序
function normalize(results, ordered) {
  const r = results.filter(x => x.fields?.length).at(-1)
  if (!r) return null
  const rows = r.rows.map(row => JSON.stringify(row))
  return JSON.stringify(ordered ? rows : rows.sort())
}

// 一次執行的結果摘要：expect-error 題是 'ERR'（以指定的 SQLSTATE 失敗）或 'OK'，其他題是正規化後的結果
async function outcome(page, db, spec, sql, iso, closed) {
  try {
    const r = await sandbox(page, db, spec, sql, iso, closed)
    return { ...r, key: spec.expectError ? 'OK' : normalize(r.final, 'ordered' in spec) }
  } catch (e) {
    if (spec.expectError && e.code === spec.expectError) return { error: e, key: 'ERR' }
    throw e
  }
}

// 回傳 { pass, want, msg?, error?, results?, msgs? }。標準答案出錯會直接 throw（題目本身有問題）
export async function grade(page, db, spec, sql) {
  const text = stripComments(sql)
  const forbidden = spec.forbid && text.match(new RegExp(spec.forbid, 'i'))
  if (forbidden) return { pass: false, msg: spec.forbidMsg || `這題不能用「${forbidden[0]}」。` }
  if (spec.require && !new RegExp(spec.require, 'i').test(text)) return { pass: false, msg: spec.requireMsg || '少了這題要求的步驟，再看一次題目。' }

  const iso = isIsolated(spec, sql)
  // 全新資料庫裡的標準答案每次都一樣，算一次就好；頁面資料庫可能被練習區改過，每次重算
  const forced = 'isolated' in spec || !!spec.setups?.length
  const want = forced && spec.want != null ? spec.want : (await outcome(page, db, spec, spec.answer, iso)).key
  if (forced) spec.want = want

  let got
  try { got = await outcome(page, db, spec, sql, iso, true) } catch (error) { return { pass: false, want, error } }
  const { key, error, res, final } = got
  const base = { want, error, results: final, msgs: res?.msgs }
  if (spec.expectError && key === 'OK') return { ...base, pass: false, msg: `這段 SQL 應該要以錯誤 ${spec.expectError} 結束，卻成功執行了。` }
  if (spec.maxStatements && res && res.length > Number(spec.maxStatements)) return { ...base, pass: false, msg: `這題要在 ${spec.maxStatements} 句之內完成（並發時兩句之間會被別人插隊），你寫了 ${res.length} 句。` }
  return { ...base, pass: key === want }
}

// ---------- 頁面元件 ----------
let db, dbP, page
// 給頁面自訂的互動示範用（例如第 25 課的 SQL injection）：getDb().query(sql, params)、getDb().exec(sql)
export const getDb = () => db

function freshDb() {
  db?.close()
  db = null
  dbP = openDb(page).then(d => {
    d.onDead = freshDb   // 頁面資料庫卡住（等鎖）被看門狗終止時，重建一個
    return db = d
  })
  return dbP
}

const showMsgs = (out, msgs) => msgs?.forEach(m => out.appendChild(el('div', 'notice', m)))

// 把結果畫成表格；非 SELECT 的語句顯示一行摘要。notices／通知顯示在最上面
function renderResults(out, results, msgs = results.msgs) {
  out.replaceChildren()
  showMsgs(out, msgs)
  for (const r of results) {
    if (r.fields?.length) {
      const t = el('table')
      const head = t.createTHead().insertRow()
      r.fields.forEach(f => head.appendChild(el('th', null, f.name)))
      const body = t.createTBody()
      for (const row of r.rows) {
        const tr = body.insertRow()
        row.forEach(v => {
          tr.appendChild(v == null ? el('td', 'null', 'NULL') : el('td', null, v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)))
        })
      }
      out.appendChild(t)
      out.appendChild(el('div', 'meta', `${r.rows.length} 列`))
    } else {
      out.appendChild(el('div', 'meta ok', `✓ ${r.command ?? '完成'}${r.rowCount != null ? `，影響 ${r.rowCount} 列` : ''}`))
    }
  }
}

function renderError(out, e, pageDb) {
  out.replaceChildren()
  showMsgs(out, e.msgs)
  out.appendChild(el('div', 'error', e.detail ? `${e.message}\n${e.detail}` : e.message))
  if (e.code === 'TIMEOUT') out.appendChild(el('div', 'hint', pageDb ? '💡 頁面上的資料庫已重置。' : '💡 這次練習用的是另開的資料庫，頁面上的資料不受影響。'))
  if (ERROR_HINTS[e.code]) out.appendChild(el('div', 'hint', '💡 ' + ERROR_HINTS[e.code]))
}

function makeEditor(sql) {
  const ta = el('textarea')
  ta.value = sql.trim()
  ta.spellcheck = false
  ta.rows = Math.max(3, ta.value.split('\n').length + 1)
  return ta
}

function setupLab(box) {
  const ta = makeEditor(box.dataset.sql)
  const run = el('button', 'primary', '執行 ▶')
  const out = el('div', 'out')
  const go = async () => {
    const d = await dbP
    try { renderResults(out, await d.exec(ta.value, { ...ARR, stats: true })) } catch (e) {
      renderError(out, e, true)
      // 不自動 ROLLBACK：第 18、31 課要學習者親眼看到 aborted 交易，再自己 ROLLBACK（或 ROLLBACK TO SAVEPOINT）
      if (!d.dead && await d.inTx()) out.appendChild(el('div', 'hint', '💡 交易還開著，但已經中止：之後每一句都會失敗（25P02），先執行 ROLLBACK;（有存檔點也可以 ROLLBACK TO SAVEPOINT）。'))
    }
  }
  run.onclick = go
  ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go() }
  const bar = el('div', 'bar')
  bar.append(run, el('span', 'kbd', '⌘/Ctrl + Enter'))
  box.append(ta, bar, out)
}

const scriptsOf = (box, role) => [...box.querySelectorAll(`script[data-role="${role}"]`)].map(s => s.textContent)

function setupExercise(box, onPass) {
  const spec = { ...box.dataset, setups: scriptsOf(box, 'setup') }
  const ta = makeEditor(spec.start ?? '')
  const run = el('button', null, '執行')
  const check = el('button', 'primary', '檢查答案')
  const out = el('div', 'out')
  const verdict = el('div', 'verdict')
  const answer = el('details')
  answer.append(el('summary', null, '看答案'), el('pre', null, spec.answer))

  run.onclick = async () => {
    const iso = isIsolated(spec, ta.value)
    try { renderResults(out, (await sandbox(page, await dbP, spec, ta.value, iso)).res) } catch (e) { renderError(out, e, !iso) }
  }
  check.onclick = async () => {
    const fail = text => { verdict.className = 'verdict fail'; verdict.textContent = '✗ ' + text }
    let r
    try { r = await grade(page, await dbP, spec, ta.value) } catch (e) {
      renderError(out, e)
      return fail('標準答案執行失敗，請按「↺ 重置資料庫」再試一次。')
    }
    if (r.error) renderError(out, r.error, !isIsolated(spec, ta.value))
    else if (r.results) renderResults(out, r.results, r.msgs)
    else out.replaceChildren()
    if (!r.pass) return fail(r.msg ?? (r.error ? '執行出錯了，看上面的錯誤訊息。' : '結果跟預期不一樣，對照一下題目再試試。'))
    verdict.className = 'verdict pass'
    verdict.textContent = '✓ 正確！'
    onPass(box)
  }
  ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') check.click() }
  const bar = el('div', 'bar')
  bar.append(run, check)
  box.append(ta, bar, out, verdict, answer)
}

const CSS = `
.out .notice { font: 13px ui-monospace, Menlo, monospace; white-space: pre-wrap; color: var(--muted); border-left: 3px solid var(--border); padding: 2px 8px; margin-bottom: 4px; }
`

async function init() {
  document.head.append(el('style', null, CSS))
  const onPass = initLesson(LESSONS, KEY, STAGES)
  if (!document.querySelector('.lab, .exercise')) return

  const text = id => document.getElementById(id)?.textContent ?? ''
  const b = document.body
  page = { seed: text('seed'), seedAfter: text('seed-after'), extensions: b.getAttribute('data-pg-extensions') ?? '', twoPc: b.hasAttribute('data-pg-2pc') }
  const status = el('div', 'engine-status', '⏳ 正在瀏覽器裡啟動 PostgreSQL…')
  const reset = el('button', null, '↺ 重置資料庫')
  reset.onclick = async () => {
    reset.disabled = true
    await freshDb().catch(() => {})
    document.querySelectorAll('.out, .verdict').forEach(o => { o.replaceChildren(); o.className = o.className.split(' ')[0] })
    reset.disabled = false
  }
  document.querySelector('header').append(status)
  try {
    await freshDb()
    status.replaceChildren(el('span', null, `✓ PostgreSQL ${db.version} 已就緒（資料只在這個分頁裡） `), reset)
  } catch (e) {
    status.textContent = '✗ 啟動失敗：' + e.message
    return
  }
  document.querySelectorAll('.lab').forEach(setupLab)
  document.querySelectorAll('.exercise').forEach(b => setupExercise(b, onPass))
}

if (globalThis.document?.body.dataset.lesson) init()
