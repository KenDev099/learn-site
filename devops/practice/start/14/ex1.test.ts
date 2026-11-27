import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { run } from '../../helpers/docker.ts'
import { makeRebaseRepo, runScript, gitEnv } from './repos.ts'

const dir = import.meta.dirname
const repo = join(dir, 'ex1-repo')

test('ex1.sh 把 feature/loyalty rebase 到 main 上，兩種折扣都保留、可以疊加', () => {
  const { git, main, feature } = makeRebaseRepo(repo, dir)
  const r = runScript(dir, 'ex1.sh', repo)
  assert.equal(r.code, 0, `sh ex1.sh ex1-repo 失敗（結束碼 ${r.code}）：\n${(r.stderr || r.stdout).slice(-800)}`)
  assert.equal(git('rev-parse', 'main'), main, 'main 不能被改動：這題只移動 feature/loyalty')
  assert.equal(run('git', ['-C', repo, 'rebase', '--show-current-patch'], { env: gitEnv(dir) }).code === 0, false,
    'rebase 還沒結束（還停在衝突）：解完衝突要 git add，再 git rebase --continue')
  assert.equal(run('git', ['-C', repo, 'merge-base', '--is-ancestor', 'main', 'feature/loyalty'], { env: gitEnv(dir) }).code, 0,
    'main 要是 feature/loyalty 的祖先：feature 要接在最新的 main 後面')
  assert.equal(git('rev-list', '--merges', 'main..feature/loyalty'), '', 'feature/loyalty 上出現了 merge commit：這題要用 rebase，不是把 main merge 進來')
  const log = git('log', '--reverse', '--format=%an|%s', 'main..feature/loyalty').split('\n')
  assert.deepEqual(log, ['林志豪|feat: 會員 9 折', '林志豪|test: 會員價的測試'],
    `feature 原本的 2 個 commit（作者、訊息）要原樣保留，現在是：\n${log.join('\n')}`)
  assert.ok(!feature.includes(git('rev-parse', 'feature/loyalty')), 'feature/loyalty 還指著舊的 commit')
  const markers = run('git', ['-C', repo, 'grep', '-n', '-E', '^(<<<<<<<|=======|>>>>>>>)( |$)', 'feature/loyalty'], { env: gitEnv(dir) })
  assert.equal(markers.stdout, '', `commit 裡還有衝突標記：\n${markers.stdout}`)

  const pkg = JSON.parse(git('show', 'feature/loyalty:package.json'))
  assert.equal(pkg.version, '1.3.0', 'package.json 的 version 要是 main 的 1.3.0')
  assert.deepEqual(pkg.engines, { node: '>=24' }, 'package.json 要保留 feature 加的 engines')
  let lock: any
  try { lock = JSON.parse(git('show', 'feature/loyalty:package-lock.json')) } catch { assert.fail('package-lock.json 不是合法的 JSON') }
  assert.equal(lock.version, pkg.version, 'package-lock.json 的 version 跟 package.json 不一致：不要手動合，用 npm install --package-lock-only 重新產生')
  assert.deepEqual(lock.packages?.['']?.engines, pkg.engines, 'package-lock.json 跟 package.json 不一致（engines）：不要手動合，用 npm install --package-lock-only 重新產生')

  // 在分支尖端的乾淨 worktree 跑 repo 自己的測試，再加一個疊加規則的測試
  const wt = join(mkdtempSync(join(tmpdir(), 'ld-14-')), 'wt')
  try {
    git('worktree', 'add', '-q', '--detach', wt, 'feature/loyalty')
    writeFileSync(join(wt, 'test', 'zz-stack.spec.ts'), `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { price } from '../src/pricing.ts'
test('會員在歡樂時光：先 9 折再 8 折，四捨五入', () => {
  assert.equal(price(110, { member: true, happyHour: true }), 79)
  assert.equal(price(80, { member: true, happyHour: true }), 58)
  assert.equal(price(120, { happyHour: true }), 96)
  assert.equal(price(70, { member: true }), 63)
})
`)
    const t = run('node', ['--test'], { cwd: wt, env: gitEnv(dir) })
    assert.equal(t.code, 0, `在 feature/loyalty 尖端跑 node --test 沒過：\n${t.stdout.split('\n').filter(l => /✖|Error|expected|actual/.test(l)).slice(0, 12).join('\n')}`)
    assert.match(readFileSync(join(wt, 'src', 'pricing.ts'), 'utf8'), /member/, 'src/pricing.ts 要有會員價')
  } finally {
    run('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { env: gitEnv(dir) })
    rmSync(join(wt, '..'), { recursive: true, force: true })
  }
})
