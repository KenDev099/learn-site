import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { run } from '../../helpers/docker.ts'
import { makeRevertRepo, runScript, gitEnv } from './repos.ts'

const dir = import.meta.dirname
const repo = join(dir, 'ex2-repo')

test('ex2.sh 用 revert 撤回「feat: new tax rounding」，不改寫歷史', () => {
  for (const after of [[1, 1], [2, 2]] as [number, number][]) {   // 兩個 repo：壞 commit 後面的 commit 數不同
    const { git, bad, tip } = makeRevertRepo(repo, dir, after)
    const r = runScript(dir, 'ex2.sh', repo)
    assert.equal(r.code, 0, `sh ex2.sh ex2-repo 失敗（結束碼 ${r.code}）：\n${(r.stderr || r.stdout).slice(-800)}`)
    assert.equal(run('git', ['-C', repo, 'merge-base', '--is-ancestor', tip, 'main'], { env: gitEnv(dir) }).code, 0,
      '原本的 main 尖端不在新的 main 上：歷史被改寫了（reset 或 rebase）。別人已經拉過 main，只能往前加 commit')
    const added = git('rev-list', `${tip}..main`).split('\n').filter(Boolean)
    assert.equal(added.length, 1, `main 上要剛好多 1 個 commit，現在多了 ${added.length} 個`)
    const msg = git('log', '-1', '--format=%B', 'main')
    assert.ok(msg.includes(`This reverts commit ${bad}.`), `新的 commit 要是 git revert 產生的，訊息裡要有「This reverts commit ${bad.slice(0, 12)}…」，這樣日後查得到撤回了哪一個 commit。現在的訊息：\n${msg}`)
    assert.equal(git('diff', `${bad}^`, 'main', '--', 'src/tax.ts'), '', 'src/tax.ts 要回到壞 commit 之前的樣子（Math.round）')
    assert.equal(git('diff', '--stat', tip, 'main'), git('diff', '--stat', bad, `${bad}^`), '只能撤回那個 commit 的改動，別人之後的 commit 要保留')
    assert.match(git('show', 'main:src/menu.ts'), /可頌/, '李建國加的可頌不見了')
  }
})
