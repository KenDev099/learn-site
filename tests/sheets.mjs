// 檢查每個階段的一頁圖解（<課程>/sheets/stage-N.html）
// 用法：node sheets.mjs [課程 …]（不給就測所有有 sheets/ 的課）。要先在 learn/ 開 8000 伺服器
// - 課程地圖：STAGES 有第 3 個元素的階段，標題旁都有「一頁圖解」連結，而且打得開；沒有的課不會出現連結
// - 每張圖解：1280／390 寬 × 淺色／深色都不會橫向捲動、沒有 console 錯誤、有回地圖連結（../index.html）
// - 每張圖解的 .md 與 .html 都在、.md 改過後有重新 render；階段最後一課連到這張圖解
// - 課程頁：頁首的階段名稱後面自動有所屬階段的圖解連結（每門課抽最後一個階段的第一課）
// - 提醒（不算錯）：圖解比該階段某一課舊（git 最後修改時間），可能要更新
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const ROOT = new URL('../', import.meta.url).pathname
const BASE = 'http://localhost:8000/'
const all = readdirSync(ROOT).filter(c => existsSync(`${ROOT}${c}/lab.js`)).sort()
const courses = process.argv.slice(2).length ? process.argv.slice(2) : all.filter(c => existsSync(`${ROOT}${c}/sheets`))
let problems = 0
const fail = msg => { problems++; console.log('  ✗ ' + msg) }

// git 最後一次 commit 的時間；有未提交的修改就用檔案時間
const changed = new Set(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map(l => l.slice(3)))
const mtime = f => changed.has(f) || [...changed].some(d => d.endsWith('/') && f.startsWith(d))
  ? statSync(ROOT + f).mtimeMs
  : Number(execFileSync('git', ['log', '-1', '--format=%ct', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim() || 0) * 1000 || statSync(ROOT + f).mtimeMs

const b = await chromium.launch({ channel: 'chrome' })
for (const c of courses) {
  console.log(`== ${c}`)
  const { STAGES } = await import(`${ROOT}${c}/lab.js`).catch(() => ({}))
  // lab.js 在 Node 裡 import 會碰到 document：改用文字解析
  const src = readFileSync(`${ROOT}${c}/lab.js`, 'utf8')
  const stages = STAGES?.map(([t, list, s]) => [t, list.map(l => l[2]).filter(Boolean), s]) ?? [...src.matchAll(/\[\s*'([^']+)',\s*\[([\s\S]*?)\n  \](?:, '([^']+)')?\]/g)].map(m => [m[1], [...m[2].matchAll(/'([\w-]+\.html)'/g)].map(x => x[1]), m[3]])
  const sheets = stages.map(s => s[2]).filter(Boolean)
  for (const [, lessons, sheet] of stages) {
    if (!sheet) continue
    const md = `${c}/${sheet.replace(/\.html$/, '.md')}`, html = `${c}/${sheet}`
    if (!existsSync(ROOT + md)) fail(`找不到 ${md}`)
    if (!existsSync(ROOT + html)) { fail(`找不到 ${html}`); continue }
    const last = `${c}/lessons/${lessons.at(-1)}`
    if (!readFileSync(ROOT + last, 'utf8').includes(`href="../${sheet}"`)) fail(`${last} 沒有連到 ../${sheet}`)
    if (existsSync(ROOT + md) && mtime(html) < mtime(md)) fail(`${md} 改過之後沒有重新 render（node sheets-render.mjs ${c} ${sheet.match(/stage-(\d+)/)[1]}）`)
    const newer = lessons.map(l => `${c}/lessons/${l}`).filter(l => mtime(l) > mtime(md))
    if (newer.length) console.log(`  ! ${md} 比這些課舊，內容可能要更新：${newer.map(l => l.split('/').at(-1)).join('、')}`)
  }
  const lastStage = stages.filter(s => s[2]).at(-1)
  if (lastStage) {
    const p = await b.newPage()
    await p.goto(`${BASE}${c}/lessons/${lastStage[1][0]}`)
    const href = await p.waitForSelector('.eyebrow a.sheet', { timeout: 10000 }).then(a => a.getAttribute('href')).catch(() => null)
    if (href !== `../${lastStage[2]}`) fail(`${lastStage[1][0]} 頁首的圖解連結是 ${href}，應該是 ../${lastStage[2]}`)
    await p.close()
  }
  for (const [w, colorScheme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, colorScheme })
    const p = await ctx.newPage(); const errs = []
    p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message))
    const at = `${w}px ${colorScheme === 'dark' ? '深色' : '淺色'}`
    errs.length = 0
    await p.goto(`${BASE}${c}/`); await p.waitForSelector('.stage')
    const links = await p.$$eval('.stage h2 .sheet', as => as.map(a => a.getAttribute('href')))
    if (links.join() !== sheets.join()) fail(`${at} 地圖的圖解連結 ${links.length} 個，STAGES 有 ${sheets.length} 個`)
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    if (ov > 0) fail(`${at} 地圖橫向溢出 ${ov}px`)
    if (errs.length) fail(`${at} 地圖 console：${errs.join(' | ').slice(0, 200)}`)
    for (const s of sheets) {
      errs.length = 0
      const r = await p.goto(`${BASE}${c}/${s}`)
      if (!r.ok()) { fail(`${at} ${s} 打不開（${r.status()}）`); continue }
      await p.waitForTimeout(200)
      const { ov, back } = await p.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, back: [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '../index.html') }))
      if (ov > 0) fail(`${at} ${s} 橫向溢出 ${ov}px`)
      if (!back) fail(`${at} ${s} 沒有回地圖的連結（../index.html）`)
      if (errs.length) fail(`${at} ${s} console：${errs.join(' | ').slice(0, 200)}`)
    }
    await ctx.close()
  }
  console.log(`  ${sheets.length} 張圖解`)
}
// 沒有圖解的課：地圖不能出現圖解連結
for (const c of all.filter(c => !courses.includes(c) && !existsSync(`${ROOT}${c}/sheets`))) {
  const p = await b.newPage(); await p.goto(`${BASE}${c}/`); await p.waitForSelector('.stage')
  if (await p.$('.stage h2 .sheet')) fail(`${c} 沒有 sheets/，地圖卻有圖解連結`)
  await p.close()
}
await b.close()
console.log(problems ? `✗ ${problems} 個問題` : '✓ 全部通過')
process.exit(problems ? 1 : 0)
