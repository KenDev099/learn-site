// 用 Chrome 逐頁測：首頁與各課 roadmap 的連結、引擎啟動、所有範例、每題錯答／正解、選擇題、進度、手機寬度、console 錯誤
// 用法：node pages.mjs [node/lessons/xx.html …]（相對於 learn/，不給就測全部，最後再跑 sheets.mjs 檢查階段圖解）。要先在 learn/ 開 8000 伺服器
// 連結：連到各課 lab.js 裡列了、但還沒寫好的課，平常只提醒；STRICT=1 時一律算錯（全部課程寫完後用）
// 本機練習（.local）不在這裡跑測試（那是 local-verify.mjs 的事），這裡假裝測試全過，檢查頁面會判對、答案檔存在
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
const ROOT = new URL('../', import.meta.url).pathname
const BASE = 'http://localhost:8000/'
const courses = readdirSync(ROOT).filter(c => existsSync(`${ROOT}${c}/lab.js`)).sort()
const args = process.argv.slice(2)
const strict = process.env.STRICT === '1'
const planned = new Set(courses.flatMap(c => [...readFileSync(`${ROOT}${c}/lab.js`, 'utf8').matchAll(/'([\w-]+\.html)'/g)].map(m => `${BASE}${c}/lessons/${m[1]}`)))
let pending = new Set()
// 檢查連結：回傳打不開的（還沒寫好的課不算，除非 STRICT=1）
const brokenLinks = async urls => {
  const broken = []
  for (const url of urls) if (!(await p.request.get(url)).ok()) (!strict && planned.has(url) ? pending.add(url) : broken.push(url))
  return broken
}
const files = args.length ? args : courses.flatMap(c => readdirSync(`${ROOT}${c}/lessons`).filter(f => f.endsWith('.html')).sort().map(f => `${c}/lessons/${f}`))
const b = await chromium.launch({ channel: 'chrome' })
const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage()
let errs = [], problems = 0
// 預覽 iframe（about:srcdoc）裡的錯誤是學習者內容造成的（CSP 擋下的資源、sandbox 擋下的 script），不算頁面的錯
p.on('console', m => m.type() === 'error' && !m.location().url?.startsWith('about:srcdoc') && errs.push(m.text()))
p.on('pageerror', e => errs.push(e.message))

// 本機練習的測試結果：每一題都回傳「全部通過」
await p.route('**/practice/results/*.json', async route => {
  const tests = (await p.$$eval('.local', bs => bs.map(b => b.dataset.test))).map(t => ({ file: `${t}.test.ts`, name: 'ok', ok: true, message: '' }))
  await route.fulfill({ json: { time: new Date().toISOString(), tests } })
})

// 首頁、所有階段圖解與各課 roadmap：畫得出來、沒有 console 錯誤、每個連結都打得開
if (!args.length) for (const page of ['', 'sheets.html', ...courses.map(c => c + '/')]) {
  errs = []
  await p.goto(BASE + page)
  await p.waitForFunction(() => document.querySelectorAll('main li').length > 0, null, { timeout: 10000 })
  const links = [...new Set(await p.$$eval('a[href]', as => as.map(a => a.href.split('#')[0])))]
  const broken = await brokenLinks(links)
  const line = [`== /${page}  ${links.length} 個連結`]
  if (broken.length) { problems++; line.push('  ✗ 打不開：' + broken.join(' ')) }
  if (errs.length) { problems++; line.push('  ✗ console: ' + errs.join(' | ').slice(0, 300)) }
  console.log(line.join('\n'))
}

// 把程式碼填進題目的編輯器（PostgreSQL 是 textarea，其他課是 Monaco），按「檢查答案」，回傳判定文字
// HTML／CSS 題（.exercise.web）的 code 是 { html, css }，分別填進 data-part 對應的編輯器
const verdict = async (ex, code) => {
  const v = await ex.$('.verdict'); await v.evaluate(e => { e.textContent = '' })
  const ta = await ex.$(':scope > textarea')
  if (ta) await ta.fill(code)
  else await ex.evaluate((box, code) => {
    const eds = monaco.editor.getEditors()
    if (typeof code === 'string') return eds.find(e => box.contains(e.getContainerDomNode())).setValue(code)
    for (const [k, v] of Object.entries(code)) eds.find(e => box.querySelector(`[data-part="${k}"]`)?.contains(e.getContainerDomNode()))?.setValue(v)
  }, code)
  await (await ex.$(':scope > .bar > button.primary')).click()
  await p.waitForFunction(el => el.textContent, v, { timeout: 40000 }); return v.innerText()
}
const scripts = (ex, type) => ex.$$eval(`script[type="${type}"]`, ss => ss.map(s => s.textContent))

// HTML／CSS 題：起始內容與每個 wrong（JSON，缺的部分用標準答案補）都要判錯，標準答案要判對
const webExercise = async (ex, i, line) => {
  const one = async type => (await scripts(ex, type))[0]?.replace(/^\n+|\s+$/g, '').replaceAll('<\\/script', '</script')
  const answer = { html: await one('answer-html') ?? '', css: await one('answer-css') ?? '' }
  const start = { html: await one('start-html') ?? await one('fixed-html') ?? '', css: await one('start-css') ?? await one('fixed-css') ?? '' }
  const wrongs = [['起始內容', start], ...await ex.$$eval('script[type="wrong"]', ss => ss.map(s => [s.dataset.name ?? '', s.textContent]))]
  for (const [k, [name, w]] of wrongs.entries()) {
    let code = w
    if (k) try { code = { ...answer, ...JSON.parse(w) } } catch (e) { problems++; line.push(`  ✗ 練習 ${i + 1}：錯誤寫法 ${k}（${name}）不是 JSON：${e.message}`); continue }
    const v = await verdict(ex, code)
    if (!v.startsWith('✗')) { problems++; line.push(`  ✗ 練習 ${i + 1}：${k ? `錯誤寫法 ${k}（${name}）` : name}沒有判錯 → ${v.slice(0, 40)}`) }
  }
  const right = await verdict(ex, answer)
  if (!right.startsWith('✓')) { problems++; line.push(`  ✗ 練習 ${i + 1}：標準答案沒有判對 → ${right.slice(0, 60)}\n    ${(await ex.$eval('.out', o => o.innerText)).replace(/\n/g, '\n    ').slice(0, 1500)}`) }
}

for (const f of files) {
  errs = []; const t0 = Date.now()
  await p.goto(BASE + f)
  if (await p.$('.lab, .exercise')) await p.waitForFunction(() => /已就緒|失敗/.test(document.querySelector('.engine-status')?.textContent), null, { timeout: 90000 })
  const line = [`== ${f}  ${Date.now() - t0}ms`]
  for (const [i, lab] of (await p.$$('.lab')).entries()) {
    await (await lab.$(':scope > .bar > button')).click()
    await p.waitForFunction(o => o.childElementCount > 0, await lab.$('.out'), { timeout: 20000 })
      .catch(() => { problems++; line.push(`  ✗ 範例 ${i + 1} 沒有輸出`) })
  }
  // 起始程式和每個已知的錯誤寫法都要判錯，標準答案要判對
  for (const [i, ex] of (await p.$$('.exercise')).entries()) {
    if (await ex.evaluate(e => e.classList.contains('web'))) { await webExercise(ex, i, line); continue }
    const [answer] = await scripts(ex, 'answer')
    // PostgreSQL 題的答案在 data-answer，錯誤寫法是 <script type="text/sql" data-role="wrong">
    const wrongs = answer === undefined ? ['SELECT 1;', ...await ex.$$eval('script[data-role="wrong"]', ss => ss.map(s => s.textContent))] : [...await scripts(ex, 'start'), ...await scripts(ex, 'wrong')]
    for (const [k, w] of wrongs.entries()) {
      const v = await verdict(ex, w)
      if (!v.startsWith('✗')) { problems++; line.push(`  ✗ 練習 ${i + 1}：${k ? `錯誤寫法 ${k}` : '起始程式'}沒有判錯 → ${v.slice(0, 40)}`) }
    }
    const right = await verdict(ex, answer ?? await ex.getAttribute('data-answer'))
    if (!right.startsWith('✓')) { problems++; line.push(`  ✗ 練習 ${i + 1}：標準答案沒有判對 → ${right.slice(0, 60)}`) }
  }
  // 本機練習：答案檔和起始檔都要在，頁面讀到「全部通過」要判對
  const locals = await p.$$('.local')
  if (locals.length) {
    const { practice, task } = await p.evaluate(() => ({ practice: document.body.dataset.practice, task: document.body.dataset.task ?? document.body.dataset.lesson.padStart(2, '0') }))
    for (const [i, box] of locals.entries()) {
      for (const file of (await box.getAttribute('data-files')).split(/\s+/).filter(Boolean))
        for (const kind of ['start', 'answer'])
          if (!(await p.request.get(`${BASE}${practice}/practice/${kind}/${task}/${file}`)).ok()) { problems++; line.push(`  ✗ 本機練習 ${i + 1}：找不到 ${kind}/${task}/${file}`) }
      await p.waitForFunction(b => b.querySelector('.verdict.pass'), box, { timeout: 10000 })
        .catch(() => { problems++; line.push(`  ✗ 本機練習 ${i + 1}：測試全過卻沒有判對`) })
    }
  }
  const broken = await brokenLinks([...new Set(await p.$$eval('main a[href]', as => as.map(a => a.href.split('#')[0])))].filter(u => u.startsWith(BASE)))
  if (broken.length) { problems++; line.push('  ✗ 連結打不開：' + broken.join(' ')) }
  for (const q of await p.$$('.quiz')) await (await q.$(`label[data-key="${await q.getAttribute('data-correct')}"]`)).click()
  const status = await p.$eval('.status', s => s.textContent).catch(() => '')
  if (!status.includes('完成')) { problems++; line.push('  ✗ 狀態：' + status) }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  if (overflow > 0) { problems++; line.push(`  ✗ 手機寬度溢出 ${overflow}px`) }
  // 有 HTML／CSS 題的頁面再用 320px 檢查一次（WCAG 1.4.10 Reflow）
  if (await p.$('.exercise.web')) {
    await p.setViewportSize({ width: 320, height: 800 }); await p.waitForTimeout(300)
    const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    if (o > 0) { problems++; line.push(`  ✗ 320px 寬溢出 ${o}px`) }
    await p.setViewportSize({ width: 390, height: 800 })
  }
  if (errs.length) { problems++; line.push('  ✗ console: ' + errs.join(' | ').slice(0, 300)) }
  console.log(line.join('\n') + '  ' + status)
}
if (pending.size) console.log(`（${pending.size} 個連結指向還沒寫好的課，全部寫完後用 STRICT=1 再檢查）`)
await b.close()
// 測全部時順便檢查每個階段的一頁圖解（sheets.mjs：連結、render 是否過期、深淺色與手機寬度）
if (!args.length) {
  console.log('== 階段圖解（sheets.mjs）')
  const { status } = (await import('node:child_process')).spawnSync('node', [new URL('sheets.mjs', import.meta.url).pathname], { stdio: 'inherit' })
  if (status) problems++
}
console.log(problems ? `✗ ${problems} 個問題` : '✓ 全部通過')
process.exit(problems ? 1 : 0)
