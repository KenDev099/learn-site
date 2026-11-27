import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { run } from '../../helpers/docker.ts'
import { makeResetRepo, runScript, gitEnv } from './repos.ts'

const dir = import.meta.dirname
const repo = join(dir, 'ex4-repo')

test('ex4.sh 用 reflog 找回被 reset 掉的 3 個 commit，建立 rescue 分支', () => {
  for (const after of [1, 2]) {   // 兩個 repo：reset 之後又 commit 了 1 次、2 次
    const { git, lost, tip } = makeResetRepo(repo, dir, after)
    const menu = git('rev-parse', 'feature/menu')
    const r = runScript(dir, 'ex4.sh', repo)
    assert.equal(r.code, 0, `sh ex4.sh ex4-repo 失敗（結束碼 ${r.code}）：\n${(r.stderr || r.stdout).slice(-800)}`)
    const rescue = run('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'refs/heads/rescue'], { env: gitEnv(dir) }).stdout
    assert.ok(rescue, '找不到 rescue 分支')
    const on = git('rev-list', 'rescue').split('\n')
    const found = lost.filter(c => on.includes(c)).length
    assert.equal(found, 3, `rescue 上只找到 ${found} 個原本的 commit：要讓 rescue 指向 reset 之前的尖端，原本的 commit（SHA 相同）才會都在。照內容重做的 commit SHA 會不同`)
    assert.equal(rescue, tip, `reset 之後又 commit 了 ${after} 次的 repo：rescue 要指向 reset 之前 feature/menu 的尖端。reflog 的編號會隨之後的 commit 變動，不能寫死 @{N}，要依 reset 那一筆找`)
    assert.equal(git('rev-parse', 'feature/menu'), menu, 'feature/menu 不能動：同事 reset 之後又 commit 了新的東西，reset 回去會把它們弄丟')
  }
})
