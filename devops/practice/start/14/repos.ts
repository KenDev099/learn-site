// 練習用的 git repo：每次跑測試都重新產生在這一題的資料夾裡（ex1-repo/ … ex4-repo/），跑完可以自己進去看
// repo 裡的測試檔叫 *.spec.ts / *.spec.js，不會被 check.mjs 當成這一題的測試
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { run } from '../../helpers/docker.ts'

// 只用 repo 自己的設定：不讀你的 ~/.gitconfig（簽章、hook、別名都不影響結果）；GIT_EDITOR=true 讓 rebase --continue、revert 不開編輯器
// GIT_CEILING_DIRECTORIES 讓 git 不會往上找到別的 repo
export const gitEnv = (dir: string) => ({
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0',
  GIT_CEILING_DIRECTORIES: dir, GIT_DIR: undefined, GIT_WORK_TREE: undefined, LC_ALL: 'C',
  NODE_TEST_CONTEXT: undefined,   // 測試本身由 node --test 執行；不清掉的話，repo 裡的 node --test 會以為自己是子測試
} as NodeJS.ProcessEnv)

// 執行學習者的腳本：sh <script> <repo>，cwd 是這一題的資料夾
export const runScript = (dir: string, script: string, repo: string) =>
  run('sh', [script, repo], { cwd: dir, env: gitEnv(dir), timeout: 120_000 })

export type Author = [name: string, email: string]
const DEV: Author = ['Cafe Dev', 'dev@cafe.test']
export const MEIHUA: Author = ['陳美華', 'meihua@cafe.test']
export const ZHIHAO: Author = ['林志豪', 'zhihao@cafe.test']
const JIANGUO: Author = ['李建國', 'jianguo@cafe.test']

export function makeGit(repo: string, dir: string) {
  rmSync(repo, { recursive: true, force: true })
  mkdirSync(repo, { recursive: true })
  let n = 0
  const git = (...a: string[]) => {
    const r = run('git', ['-C', repo, ...a], { env: gitEnv(dir) })
    if (r.code !== 0) throw new Error(`產生練習 repo 失敗：git ${a.join(' ')}：${r.stderr}`)
    return r.stdout
  }
  // 時間固定往前走，作者可以指定；commit 之後回傳 SHA
  const commit = (files: Record<string, string>, msg: string, [name, email]: Author = DEV) => {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, f)), { recursive: true })
      writeFileSync(join(repo, f), text)
    }
    const date = new Date(Date.UTC(2026, 9, 1, 9) + n++ * 3_600_000).toISOString()
    git('add', '-A')
    const r = run('git', ['-C', repo, 'commit', '-q', '-m', msg], {
      env: { ...gitEnv(dir), GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    })
    if (r.code !== 0) throw new Error(`產生練習 repo 失敗：git commit：${r.stderr}`)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', DEV[0]); git('config', 'user.email', DEV[1]); git('config', 'commit.gpgsign', 'false')
  return { git, commit }
}

const token = () => randomBytes(4).toString('hex')
const notes = (i: number) => ({ [`docs/notes-${i}.md`]: `# 第 ${i} 次會議紀錄（${token()}）\n- 拿鐵 110、美式咖啡 80\n` })

// ── 練習 1：main 加了歡樂時光，feature/loyalty 加了會員價，兩邊都改了 src/pricing.ts 與 package-lock.json ──
const pkg = (version: string, engines: boolean) => `{
  "name": "cafe-pricing",
  "version": "${version}",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }${engines ? `,
  "engines": {
    "node": ">=24"
  }` : ''}
}
`
const lock = (version: string, engines: boolean) => `{
  "name": "cafe-pricing",
  "version": "${version}",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "cafe-pricing",
      "version": "${version}"${engines ? `,
      "engines": {
        "node": ">=24"
      }` : ''}
    }
  }
}
`
const pricing = (opt: string, rule: string) => `// 售價計算：base 是菜單價（元），回傳實收金額（四捨五入到整數）
export type PriceOptions = {
${opt}}

export function price(base: number, opts: PriceOptions = {}): number {
  let p = base
${rule}  return Math.round(p)
}
`
const spec = (name: string, body: string) => `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { price } from '../src/pricing.ts'

test('${name}', () => {
${body}})
`
export function makeRebaseRepo(repo: string, dir: string) {
  const { git, commit } = makeGit(repo, dir)
  commit({
    'README.md': '# cafe-pricing\n\n咖啡店的售價計算。\n',
    'package.json': pkg('1.2.0', false), 'package-lock.json': lock('1.2.0', false),
    'src/pricing.ts': pricing('', ''),
    'test/base.spec.ts': spec('沒有折扣時就是菜單價', "  assert.equal(price(110), 110)\n"),
  }, 'chore: 初始化價格模組', MEIHUA)
  git('switch', '-q', '-c', 'feature/loyalty')
  commit({
    'package.json': pkg('1.2.0', true), 'package-lock.json': lock('1.2.0', true),
    'src/pricing.ts': pricing('  member?: boolean      // 會員 9 折\n', '  if (opts.member) p = p * 0.9\n'),
  }, 'feat: 會員 9 折', ZHIHAO)
  commit({ 'test/member.spec.ts': spec('會員 9 折', "  assert.equal(price(110, { member: true }), 99)\n") }, 'test: 會員價的測試', ZHIHAO)
  git('switch', '-q', 'main')
  commit({
    'package.json': pkg('1.3.0', false), 'package-lock.json': lock('1.3.0', false),
    'src/pricing.ts': pricing('  happyHour?: boolean   // 歡樂時光 8 折\n', '  if (opts.happyHour) p = p * 0.8\n'),
    'test/happy-hour.spec.ts': spec('歡樂時光 8 折', "  assert.equal(price(110, { happyHour: true }), 88)\n"),
  }, 'feat: 歡樂時光 8 折', MEIHUA)
  commit({ 'README.md': '# cafe-pricing\n\n咖啡店的售價計算。\n\n## 折扣規則\n\n- 會員 9 折、歡樂時光 8 折，兩者可以疊加：先打 9 折再打 8 折，最後四捨五入到整數。\n- 例：拿鐵 110 元，會員在歡樂時光買是 110 × 0.9 × 0.8 = 79.2 → 79 元。\n' },
    'docs: 寫下折扣疊加規則', MEIHUA)
  const main = git('rev-parse', 'main')
  const feature = git('rev-list', '--reverse', 'main..feature/loyalty').split('\n')
  return { git, main, feature }
}

// ── 練習 2：main 上有一個壞掉的 commit「feat: new tax rounding」，之後還有別人的 commit ──
const tax = (fn: string) => `// 含 5% 營業稅的金額
export function withTax(amount: number): number {
  return ${fn}(amount * 1.05)
}
`
// after：壞 commit 之後，可頌前後各有幾個會議紀錄 commit（測試會跑兩種，寫死 HEAD~N 的寫法一定有一種會錯）
export function makeRevertRepo(repo: string, dir: string, after: [number, number] = [randomInt(1, 3), randomInt(1, 3)]) {
  const { git, commit } = makeGit(repo, dir)
  let i = 0
  commit({ 'src/menu.ts': "export const menu = { '美式咖啡': 80, '拿鐵': 110 }\n", 'src/tax.ts': tax('Math.round') }, 'chore: 初始化專案', MEIHUA)
  for (let k = randomInt(1, 4); k > 0; k--) commit(notes(i++), `docs: 第 ${i} 次會議紀錄`)
  commit({ 'src/tax.ts': tax('Math.round') + '\n// 稅率見 docs/tax.md\n', 'docs/tax.md': '營業稅 5%，四捨五入到整數。\n' }, 'docs: 說明稅額規則', MEIHUA)
  const bad = commit({ 'src/tax.ts': tax('Math.floor') + '\n// 稅率見 docs/tax.md\n' }, 'feat: new tax rounding', ZHIHAO)
  for (let k = after[0]; k > 0; k--) commit(notes(i++), `docs: 第 ${i} 次會議紀錄`)
  commit({ 'src/menu.ts': "export const menu = { '美式咖啡': 80, '拿鐵': 110, '可頌': 70 }\n" }, 'feat: 菜單加入可頌', JIANGUO)
  for (let k = after[1]; k > 0; k--) commit(notes(i++), `docs: 第 ${i} 次會議紀錄`)
  return { git, bad, tip: git('rev-parse', 'main') }
}

// ── 練習 3：約 200 個 commit，其中一個開始讓訂單金額算錯；有一段 commit 連語法都是錯的（建置不起來）──
const order = (kind: 'good' | 'bad' | 'broken', i: number) => kind === 'broken'
  ? `// 第 ${i} 版：重構進行中\nexport function total(items) {\n  return items.reduce((sum, item) => {\n`
  : `// 第 ${i} 版\nexport function total(items) {\n  return items.reduce((sum, item) => sum + item.price${kind === 'bad' ? '' : ' * item.qty'}, 0)\n}\n`
const orderSpec = `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/order.js'

test('訂單金額 = 單價 × 數量的總和', () => {
  assert.equal(total([{ price: 110, qty: 2 }, { price: 80, qty: 1 }]), 300)
})
`
export function makeBisectRepo(repo: string, dir: string) {
  const { git } = makeGit(repo, dir)
  const count = randomInt(190, 211)
  const bad = randomInt(Math.floor(count * 0.7), count - 5)        // 第一個壞 commit 的位置（0 是第一個 commit）
  // 一段建置不起來的 commit 放在正中間：bisect 第一步一定落在這裡。把它們當成「壞」的話，會往前找到這一段的開頭而找錯犯人
  // 另外在壞掉之後再放幾個（離第一個壞 commit 至少 2 個，不影響答案）
  const mid = Math.floor(count / 2)
  const broken = new Set<number>()
  for (let k = mid - 8; k <= mid + 8; k++) broken.add(k)
  for (let k = 0; k < 4; k++) broken.add(randomInt(bad + 2, count))
  // ponytail: 用 fast-import 一次寫進 200 個 commit，比逐一 git commit 快很多
  let s = ''
  for (let i = 0; i < count; i++) {
    const files: Record<string, string> = {
      'src/order.js': order(broken.has(i) ? 'broken' : i >= bad ? 'bad' : 'good', i),
      'CHANGELOG.md': `第 ${i} 版（${token()}）\n`,
    }
    if (i === 0) Object.assign(files, { 'package.json': '{\n  "name": "cafe-orders",\n  "private": true,\n  "type": "module"\n}\n', 'test/order.spec.js': orderSpec })
    const msg = i === 0 ? 'chore: 初始化訂單模組' : `chore: 第 ${i} 次調整`
    const when = 1790000000 + i * 3600
    s += `commit refs/heads/main\nmark :${i + 1}\nauthor Cafe Dev <dev@cafe.test> ${when} +0800\ncommitter Cafe Dev <dev@cafe.test> ${when} +0800\n`
    s += `data ${Buffer.byteLength(msg)}\n${msg}\n`
    if (i > 0) s += `from :${i}\n`
    for (const [f, text] of Object.entries(files)) s += `M 100644 inline ${f}\ndata ${Buffer.byteLength(text)}\n${text}\n`
  }
  const r = run('git', ['-C', repo, 'fast-import', '--quiet'], { input: s, env: gitEnv(dir) })
  if (r.code !== 0) throw new Error(`產生練習 repo 失敗：fast-import：${r.stderr}`)
  git('reset', '-q', '--hard', 'main')
  const shas = git('rev-list', '--reverse', 'main').split('\n')
  git('tag', 'v1.0', shas[0])
  return { git, bad: shas[bad], tip: shas.at(-1)!, broken: [...broken].map(k => shas[k]) }
}

// ── 練習 4：同事在 feature/menu 上 reset --hard HEAD~3，之後又 commit 了 1～2 次 ──
// after：reset 之後又 commit 了幾次（測試會跑 1 次和 2 次，寫死 feature/menu@{N} 的寫法一定有一種會錯）
export function makeResetRepo(repo: string, dir: string, after = randomInt(1, 3)) {
  const { git, commit } = makeGit(repo, dir)
  commit({ 'menu.md': '# 菜單\n- 美式咖啡 80\n' }, 'chore: 初始化菜單', MEIHUA)
  git('switch', '-q', '-c', 'feature/menu')
  const items = ['拿鐵 110', '卡布奇諾 110', '伯爵紅茶 90', '可頌 70', '起司蛋糕 120']
  let menu = '# 菜單\n- 美式咖啡 80\n'
  const lost: string[] = []
  for (const it of items) {
    menu += `- ${it}\n`
    lost.push(commit({ 'menu.md': menu, 'NOTE.md': `${it}（${token()}）\n` }, `feat: 菜單加入${it.split(' ')[0]}`, ZHIHAO))
  }
  git('reset', '-q', '--hard', 'HEAD~3')
  for (let k = 0; k < after; k++) commit({ 'NOTE.md': `重新整理菜單（${token()}）\n` }, `chore: 重新整理菜單 ${k + 1}`, ZHIHAO)
  return { git, lost: lost.slice(2), tip: lost.at(-1)! }
}
