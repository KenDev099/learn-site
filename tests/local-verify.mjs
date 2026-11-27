// 本機練習的出題檢查，每一題：
// 1. 起始檔蓋上標準答案（answer/<題號>/）要全部通過
// 2. 只有起始檔時，每個練習（exN.test.*）至少要有一個測試沒過
// 3. wrong/<題號>/<exN>-<說明>/ 是已知的錯誤寫法，蓋在標準答案上之後只跑 exN 的測試，要沒過
// 用法：node local-verify.mjs [課程] [題號…]（不給就檢查全部）。用到 Docker 的題目要先開 Docker
// 題目從 <課程>/lessons/*.html 的 <body data-practice data-lesson data-task> 找：auth 課的練習放在 nestjs/practice（data-task="auth21"），
// 所以 node local-verify.mjs auth 會檢查 nestjs/practice 的 auth21、auth26。題號可以寫 data-task 或兩位數課號（auth 21）
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isTest, runTests } from '../check.mjs'

const ROOT = new URL('../', import.meta.url).pathname
const [only, ...picked] = process.argv.slice(2)
const failed = t => !t.ok
const of = (results, ex) => results.filter(t => t.file === '*' || t.file.startsWith(ex + '.'))
const alive = pid => { try { return process.kill(pid, 0) } catch (e) { return e.code === 'EPERM' } }
let bad = 0

const tasks = []
for (const course of only ? [only] : readdirSync(ROOT).sort()) {
  const lessons = join(ROOT, course, 'lessons')
  if (!existsSync(lessons)) continue
  for (const f of readdirSync(lessons).filter(f => f.endsWith('.html')).sort()) {
    const body = readFileSync(join(lessons, f), 'utf8').match(/<body[^>]*>/)?.[0] ?? ''
    const attr = k => body.match(new RegExp(` data-${k}="([^"]*)"`))?.[1]
    const practice = attr('practice'), lesson = attr('lesson')?.padStart(2, '0')
    if (!practice) continue
    const task = attr('task') ?? lesson
    if (!picked.length || picked.includes(task) || picked.includes(lesson)) tasks.push({ practice, task })
  }
}
if (!tasks.length) {
  console.log(`✗ 找不到本機練習：${only ?? ''} ${picked.join(' ')}`)
  process.exit(1)
}

for (const { practice, task } of tasks) {
  const dir = join(ROOT, practice, 'practice')
  // 在 practice/verify/<題號>-<pid>-<label>/ 組出要測的程式：要在 practice 裡面才找得到 node_modules，
  // 而且跟 work/<題號>/ 一樣深，題目用相對路徑 import 共用的 helper（../../helpers/…）才對得上。
  // 加上 pid：同時跑好幾個檢查也不會共用資料夾（nestjs 的資料庫名稱、Redis 前綴也從資料夾名稱來）。
  // pid 放中間：vitest 的資料夾參數是子字串比對，verify/03-111-answer 不會比對到 verify/03-1112-answer
  // ex：只複製這個練習的測試檔（錯誤寫法只需要確認 exN 被擋下）
  const run = (label, layers, ex) => {
    const code = join('verify', `${task}-${process.pid}-${label}`)
    const filter = f => !ex || !isTest(f) || basename(f).startsWith(ex + '.')
    try {
      for (const layer of layers) cpSync(layer, join(dir, code), { recursive: true, filter })
      return runTests(dir, code, { quiet: true })
    } finally {
      rmSync(join(dir, code), { recursive: true, force: true })
    }
  }
  // 被 Ctrl-C、timeout 砍掉的檢查跑不到 finally：先清掉 pid 已經不在的 verify/<題號>-<pid>-<label>/
  for (const d of existsSync(join(dir, 'verify')) ? readdirSync(join(dir, 'verify')) : []) {
    const pid = d.split('-')[1]
    if (/^\d+$/.test(pid) && !alive(+pid)) rmSync(join(dir, 'verify', d), { recursive: true, force: true })
  }
  const start = join(dir, 'start', task), answer = join(dir, 'answer', task), wrong = join(dir, 'wrong', task)
  const problems = []
  const right = run('answer', [start, ...(existsSync(answer) ? [answer] : [])])
  if (!right.length) problems.push('標準答案沒有跑到任何測試')
  for (const t of right.filter(failed)) problems.push(`標準答案沒通過：${t.file} ${t.name}：${t.message.split('\n')[0]}`)
  const exercises = [...new Set(right.map(t => t.file.split('.')[0]))]
  const begin = run('start', [start])
  for (const ex of exercises) if (!of(begin, ex).some(failed)) problems.push(`${ex}：起始檔就通過了`)
  if (existsSync(wrong)) for (const variant of readdirSync(wrong).sort()) {
    const ex = variant.match(/^(ex\d+)-/)?.[1]
    if (!ex) { problems.push(`錯誤寫法 ${variant}：資料夾名稱要是 exN-說明`); continue }
    if (!of(run('wrong-' + variant, [start, answer, join(wrong, variant)], ex), ex).some(failed)) problems.push(`錯誤寫法 ${variant} 沒有被擋下`)
  }
  try { rmdirSync(join(dir, 'verify')) } catch {}   // 空了才刪：別的檢查可能同時在用
  bad += problems.length
  console.log(problems.length ? '✗' : '✓', `${practice} ${task}`, `${exercises.length} 題、${right.length} 個測試`)
  for (const s of problems) console.log('   ', s)
}
console.log(bad ? `✗ ${bad} 個問題` : '✓ 本機練習全部符合預期')
process.exit(bad ? 1 : 0)
