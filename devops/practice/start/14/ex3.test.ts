import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { run } from '../../helpers/docker.ts'
import { makeBisectRepo, runScript, gitEnv } from './repos.ts'

const dir = import.meta.dirname
const repo = join(dir, 'ex3-repo')

test('bisect.sh 用 git bisect run 找出第一個壞 commit，跳過建置不起來的 commit，最後回到 main', () => {
  for (let round = 1; round <= 2; round++) {          // 兩個不同的 repo：壞 commit 的位置每次不同
    const { git, bad } = makeBisectRepo(repo, dir)
    rmSync(join(dir, 'answer.txt'), { force: true })
    const r = runScript(dir, 'bisect.sh', repo)
    assert.equal(r.code, 0, `sh bisect.sh ex3-repo 失敗（結束碼 ${r.code}）：\n${(r.stderr || r.stdout).slice(-800)}`)
    let answer = ''
    try { answer = readFileSync(join(dir, 'answer.txt'), 'utf8').trim() } catch { assert.fail('bisect.sh 要把第一個壞 commit 的完整 SHA 寫進 answer.txt') }
    assert.match(answer, /^[0-9a-f]{40}$/, `answer.txt 要是一個完整的 40 字元 SHA，現在是「${answer.slice(0, 60)}」`)
    assert.equal(answer, bad, `第 ${round} 個 repo 找錯了：第一個壞 commit 是 ${bad.slice(0, 12)}，你寫的是 ${answer.slice(0, 12)}。` +
      '建置不起來（node --check 失敗）的 commit 要 exit 125 跳過，不能當成壞的；SHA 每次都不同，不能寫死')
    assert.notEqual(run('git', ['-C', repo, 'bisect', 'log'], { env: gitEnv(dir) }).code, 0, 'bisect 還沒結束：最後要 git bisect reset')
    assert.equal(git('symbolic-ref', '--short', 'HEAD'), 'main', '結束後 HEAD 要回到 main（git bisect reset）')
    assert.equal(git('status', '--porcelain'), '', '結束後工作目錄要是乾淨的')
  }
})
