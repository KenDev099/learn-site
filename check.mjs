// 本機練習的測試指令，在 learn/ 執行：node check.mjs <課程> <題號>，例如 node check.mjs node 05
// 1. 把 <課程>/practice/start/<題號>/ 複製到 work/<題號>/：你改過的檔案不會被蓋掉，測試檔每次都換成最新的
// 2. 跑測試：有 vitest.config 的課用 Vitest，其他課用 Node 內建的 node --test
// 3. 結果寫到 <課程>/practice/results/<題號>.json，課程頁會讀這個檔判分
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

export const isTest = f => /\.test\.[cm]?[jt]sx?$/.test(f)
// 錯誤訊息只留重點：去掉顏色碼和 stack trace，太長就截斷
const clean = s => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter(l => !/^\s+at /.test(l)).join('\n').trim().slice(0, 2000)
// 整個測試檔跑不起來（例如程式有語法錯誤）時，錯誤只印在 stderr：從出錯的檔案位置那行開始留
const fromStderr = s => {
  const lines = clean(s).split('\n')
  const i = lines.findIndex(l => /^(file:\/\/)?\/.+:\d+$/.test(l))
  return lines.slice(Math.max(i, 0)).filter(l => !/^(Node\.js v|\(node:|\(Use `node|[{}]$|\s+code: )|node:internal/.test(l)).join('\n').trim()
}

// node --test 的 reporter（check.mjs 把自己當 reporter 用）：整理成 [{ file, name, ok, message }]
export default async function* reporter(source) {
  const tests = [], stderr = {}
  for await (const { type, data } of source) {
    const file = basename(data.file ?? '')   // stderr 的事件給相對路徑，測試結果給絕對路徑，用檔名對起來
    if (type === 'test:stderr') stderr[file] = (stderr[file] ?? '') + data.message
    if ((type !== 'test:pass' && type !== 'test:fail') || data.details?.type === 'suite') continue
    const e = data.details?.error, c = e?.cause
    const wholeFile = e?.exitCode !== undefined
    const message = !e ? '' : wholeFile ? fromStderr(stderr[file]) || '測試檔沒辦法執行'
      : c?.code === 'ERR_ASSERTION' ? c.message : c?.message ? `${c.name ?? 'Error'}: ${c.message}` : String(c ?? e.message)
    tests.push({ file, name: wholeFile ? '整個測試檔沒辦法執行' : data.name, ok: type === 'test:pass', message: clean(message) })
  }
  yield JSON.stringify(tests)
}

// 跑 dir（某門課的 practice 資料夾）底下 codeDir 裡的測試，回傳 [{ file, name, ok, message }]
// 課程的 practice/prepare.mjs（有的話）先跑：例如重建這一題的資料庫。失敗時每一題都算沒過，訊息是它印出來的說明
export function runTests(dir, codeDir, { quiet = false } = {}) {
  const out = join(mkdtempSync(join(tmpdir(), 'learn-check-')), 'result.json')
  const stdio = quiet ? 'ignore' : 'inherit'
  if (existsSync(join(dir, 'prepare.mjs'))) {
    const r = spawnSync(process.execPath, ['prepare.mjs', codeDir], { cwd: dir, encoding: 'utf8' })
    if (!quiet) process.stdout.write(r.stdout + r.stderr)
    if (r.status !== 0) return [{ file: '*', name: '準備練習環境', ok: false, message: clean(r.stderr || r.stdout) || '準備練習環境失敗' }]
  }
  if (readdirSync(dir).some(f => f.startsWith('vitest.config.'))) {
    spawnSync('npx', ['vitest', 'run', codeDir, '--reporter=default', '--reporter=json', `--outputFile.json=${out}`], { cwd: dir, stdio })
    if (!existsSync(out)) return []
    return JSON.parse(readFileSync(out, 'utf8')).testResults.flatMap(f => {
      const file = basename(f.name)
      const list = f.assertionResults.map(a => ({ file, name: a.fullName, ok: a.status === 'passed', message: clean(a.failureMessages.join('\n')) }))
      return list.length || f.status !== 'failed' ? list : [{ file, name: '整個測試檔沒辦法執行', ok: false, message: clean(f.message) }]
    })
  }
  const cwd = join(dir, codeDir)
  const files = readdirSync(cwd, { recursive: true }).filter(isTest)
  spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout',
    `--test-reporter=${import.meta.filename}`, `--test-reporter-destination=${out}`, ...files], { cwd, stdio })
  return existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : []
}

if (import.meta.main) {
  const [course, task] = process.argv.slice(2)
  if (!task) {
    console.log('用法：node check.mjs <課程> <題號>，例如 node check.mjs node 05')
    process.exit(1)
  }
  const dir = join(import.meta.dirname, course, 'practice')
  const start = join(dir, 'start', task), work = join(dir, 'work', task)
  if (!existsSync(start)) {
    console.log(`找不到 ${course}/practice/start/${task}：課程名稱或題號打錯了嗎？`)
    process.exit(1)
  }
  const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {}
  if ((pkg.dependencies || pkg.devDependencies) && !existsSync(join(dir, 'node_modules'))) {
    console.log(`第一次做這門課的練習，要先安裝套件：\n  cd ${course}/practice && npm install`)
    process.exit(1)
  }
  const fresh = !existsSync(work)
  cpSync(start, work, { recursive: true, force: false })
  cpSync(start, work, { recursive: true, filter: f => statSync(f).isDirectory() || isTest(f) })
  if (fresh) console.log(`已建立 ${course}/practice/work/${task}/，打開裡面的檔案開始寫。\n`)

  const tests = runTests(dir, join('work', task))
  mkdirSync(join(dir, 'results'), { recursive: true })
  writeFileSync(join(dir, 'results', `${task}.json`), JSON.stringify({ time: new Date().toISOString(), tests }))
  const bad = tests.filter(t => !t.ok).length
  console.log('\n' + (!tests.length ? '✗ 沒有跑到任何測試，看上面的錯誤訊息。' : bad ? `✗ ${bad} 個測試沒通過。` : '✓ 全部通過！') + '結果已存好，切回課程頁就會更新。')
  process.exit(bad || !tests.length ? 1 : 0)
}
