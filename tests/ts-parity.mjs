// 用程式練習引擎（code.js）的課，每一個範例和練習分別用 tsc 5.9.3（練習區的版本）和 7.0.2（實際專案的版本）檢查：
// 標準答案兩版都要零錯誤；起始程式、已知的錯誤寫法和範例，在兩版的錯誤（行號＋代碼）要一模一樣
// 用法：node ts-parity.mjs [lesson.html…]（不給就檢查所有課，PostgreSQL 課除外）
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = new URL('../', import.meta.url).pathname
const NODE_MODULES = new URL('./node_modules/', import.meta.url).pathname
const TSC = { '5.9.3': 'typescript/bin/tsc', '7.0.2': 'typescript7/bin/tsc' }
// 跟 code.js 的 COMPILER 一致；課程頁的 data-ts 會再蓋上去
const OPTIONS = { target: 'es2022', module: 'esnext', moduleResolution: 'bundler', moduleDetection: 'force', strict: true, lib: ['es2024', 'webworker'], types: [], noEmit: true }
const args = process.argv.slice(2)
const files = args.length ? args.map(f => resolve(f))
  : readdirSync(ROOT).filter(c => c !== 'postgresql' && existsSync(join(ROOT, c, 'lessons')))
    .flatMap(c => readdirSync(join(ROOT, c, 'lessons')).filter(f => f.endsWith('.html')).sort().map(f => join(ROOT, c, 'lessons', f)))

// 跟 code.js 一樣的組法：學習者的程式＋隱藏的型別測試＋包在區塊裡的執行測試
const strip = s => s.replace(/^\n+|\s+$/g, '')
const block = tests => tests ? `\n;{\n${tests}\n}` : ''
const groups = {}   // [編譯選項, 頁面型別宣告]（JSON）→ { 檔名: { text, kind } }；kind 是 'clean'（必須零錯誤）或 'same'（兩版錯誤要一樣）
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const body = html.match(/<body[^>]*>/)?.[0] ?? ''
  if (/data-lang="js"/.test(body)) continue
  const dts = html.match(/<script type="dts">([\s\S]*?)<\/script>/)?.[1] ?? ''
  const group = groups[JSON.stringify([body.match(/data-ts='([^']*)'/)?.[1] ?? '{}', dts])] ??= {}
  const add = (name, text, kind) => { group[name] = { text, kind } }
  const lesson = file.split('/').slice(-3).filter(s => s !== 'lessons').join('-').replace('.html', '')
  // HTML／CSS 題（exercise web）的隱藏測試只轉譯不做型別檢查，這裡略過，但要列出來，它的 <script> 才不會算到前一題
  const boxes = [...html.matchAll(/<div class="(lab|exercise)( web)?"/g)].map(m => ({ kind: m[2] ? 'web' : m[1], at: m.index, parts: { wrong: [] } }))
  for (const m of html.matchAll(/<script type="(code|start|answer|types|tests|wrong)">([\s\S]*?)<\/script>/g)) {
    const parts = boxes.findLast(b => b.at < m.index).parts
    if (m[1] === 'wrong') parts.wrong.push(strip(m[2]))
    else parts[m[1]] = strip(m[2])
  }
  const count = { lab: 0, exercise: 0 }
  for (const { kind, parts: p } of boxes) {
    if (kind === 'web') continue
    const id = `${lesson}-${kind === 'lab' ? '範例' : '練習'}${++count[kind]}`
    if (kind === 'lab') { add(id + '.ts', p.code, 'same'); continue }
    const tail = '\n' + (p.types ?? '') + block(p.tests)
    add(id + '-答案.ts', p.answer + tail, 'clean')
    add(id + '-起始.ts', (p.start ?? '') + tail, 'same')
    p.wrong.forEach((w, k) => add(`${id}-錯誤${k + 1}.ts`, w + tail, 'same'))
  }
}

let bad = 0
for (const [key, group] of Object.entries(groups)) {
  const [options, dts] = JSON.parse(key)
  const dir = mkdtempSync(join(tmpdir(), 'ts-parity-'))
  copyFileSync(ROOT + 'globals.d.ts', join(dir, 'globals.d.ts'))
  if (dts) writeFileSync(join(dir, 'page.d.ts'), dts)
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { ...OPTIONS, ...JSON.parse(options) }, include: ['*.ts'] }))
  for (const [name, { text }] of Object.entries(group)) writeFileSync(join(dir, name), text)
  const errors = {}
  for (const [version, bin] of Object.entries(TSC)) {
    let out
    try { out = execFileSync(process.execPath, [NODE_MODULES + bin, '-p', '.', '--pretty', 'false'], { cwd: dir, encoding: 'utf8' }) }
    catch (e) { out = e.stdout }
    const byFile = errors[version] = {}
    for (const line of out.split('\n').filter(l => l.includes('error TS'))) {
      const m = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+)/)
      const name = m ? m[1].split('/').pop() : '(全域)'
      ;(byFile[name] ??= []).push(m ? `${m[2]}:${m[3]}` : line)
    }
  }
  const list = (version, name) => (errors[version][name] ?? []).sort().join(' ')
  if (options !== '{}' || dts) console.log('-- 編譯選項', options, dts ? '＋頁面型別宣告' : '')
  for (const name of new Set([...Object.keys(group), ...Object.keys(errors['5.9.3']), ...Object.keys(errors['7.0.2'])])) {
    const kind = group[name]?.kind
    const a = list('5.9.3', name), b = list('7.0.2', name)
    const ok = kind === 'clean' ? !a && !b : kind === 'same' && a === b
    if (!ok) bad++
    console.log(ok ? '✓' : '✗', name, kind === 'clean' && ok ? '零錯誤' : a === b ? `兩版一致 [${a || '無錯誤'}]` : `5.9.3 [${a}] ≠ 7.0.2 [${b}]`)
  }
  rmSync(dir, { recursive: true })
}
console.log(bad ? `✗ ${bad} 個問題` : '✓ 兩版判分一致')
process.exit(bad ? 1 : 0)
