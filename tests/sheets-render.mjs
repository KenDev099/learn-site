// 把一頁圖解的草稿 render 成 HTML：<課程>/sheets/stage-N.md → stage-N.html
// 用法：node sheets-render.mjs <課程> [階段號 …]（不給階段號就 render 這門課全部的草稿）
//       node sheets-render.mjs --all（render 所有課程）
// answer-me-with-html 固定在下面的 commit，第一次執行時 clone 到系統暫存目錄（MIT，Node 20 以上，不用 npm install）
// 工具的工作資料（AM_HOME）也放在暫存目錄，不寫進家目錄；有 ✗ 或 flow 交叉警告時以非 0 結束
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'https://github.com/QingYunA/answer-me-with-html'
const COMMIT = '406ef8d'   // 0.5.10
const ROOT = new URL('../', import.meta.url).pathname
const TOOL = join(tmpdir(), `answer-me-with-html-${COMMIT}`)
const AM = join(TOOL, 'skills/answer-me-with-html/scripts/am.mjs')
const AM_HOME = join(tmpdir(), 'answer-me-with-html-home')

if (!existsSync(AM)) {
  console.log(`下載 answer-me-with-html ${COMMIT} 到 ${TOOL}`)
  execFileSync('git', ['clone', '-q', REPO, TOOL], { stdio: 'inherit' })
  execFileSync('git', ['-C', TOOL, 'checkout', '-q', COMMIT], { stdio: 'inherit' })
}

// 關掉工具的新版本檢查：有新版時它會印提示（會被當成警告）並在頁面加「新版本」按鈕；版本由上面的 COMMIT 固定
execFileSync('node', [AM, 'config', 'set', 'update_check', 'off'], { env: { ...process.env, AM_HOME }, stdio: 'ignore' })

const [course, ...nums] = process.argv.slice(2)
if (!course) { console.log('用法：node sheets-render.mjs <課程> [階段號 …] 或 --all'); process.exit(2) }
const courses = course === '--all' ? readdirSync(ROOT).filter(c => existsSync(`${ROOT}${c}/sheets`)).sort() : [course]
const stageNo = f => Number(f.match(/^stage-(\d+)\.md$/)?.[1])
let bad = 0
for (const c of courses) {
  const files = nums.length && course !== '--all'
    ? nums.map(n => `stage-${n}.md`)
    : readdirSync(`${ROOT}${c}/sheets`).filter(f => /^stage-\d+\.md$/.test(f)).sort((a, b) => stageNo(a) - stageNo(b))
  for (const f of files) {
    const md = `${c}/sheets/${f}`, html = md.replace(/\.md$/, '.html')
    const r = spawnSync('node', [AM, 'render', md, '-o', html, '--no-open'], { cwd: ROOT, env: { ...process.env, AM_HOME }, encoding: 'utf8' })
    const out = (r.stdout + r.stderr).trim()
    // 第一行 ✓ 路徑、第二行 sheet · 主題 · 面板數；之後是 STE 用字提醒（只提醒）或其他警告（flow 交叉等，算錯）
    const lines = out.split('\n').slice(2).map(l => l.trim())
    const ste = lines.filter(l => /^STE|^L\d+ \[(word|sentence|paragraph)/.test(l) && !/^STE ✓/.test(l))
    const other = lines.filter(l => l && !/^STE/.test(l) && !ste.includes(l))
    const ok = r.status === 0 && out.startsWith('✓') && !other.length
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${html}${ok ? '' : '\n  ' + (other.length ? other : out.split('\n')).join('\n  ')}`)
    for (const l of ste.filter(l => /^L\d+/.test(l))) console.log(`  ! STE ${l}`)
  }
}
console.log(bad ? `✗ ${bad} 份有問題` : '✓ 全部 render 完成')
process.exit(bad ? 1 : 0)
