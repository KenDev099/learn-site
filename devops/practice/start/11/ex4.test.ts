// 練習 4：find-commit.sh 找出第一次加入金鑰的 commit；incident.json 排出外洩後的處理順序
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readJson, run } from '../../helpers/docker.ts'
import { makeRepo } from './leaky-repo.ts'

const dir = import.meta.dirname
let leak: ReturnType<typeof makeRepo>

before(() => { leak = makeRepo(join(dir, 'leaky-repo'), true) })

test('find-commit.sh 印出第一次加入金鑰的 commit（完整 SHA）', () => {
  const r = run('sh', ['find-commit.sh', 'leaky-repo', leak!.key], { cwd: dir })
  assert.equal(r.code, 0, `sh find-commit.sh 失敗：${r.stderr}`)
  const out = r.stdout.trim()
  assert.match(out, /^[0-9a-f]{40}$/, `要只印一行 40 個字元的 SHA，現在印出：\n${out.slice(0, 300)}`)
  assert.notEqual(out, leak!.removed, '這是「刪掉」金鑰的 commit：git log -S 會列出加入和刪除的 commit，新的在前面')
  assert.equal(out, leak!.sha, `${out} 不是加入金鑰的 commit。自己試：git -C leaky-repo log -S<金鑰> --oneline`)
})

test('incident.json：先輪替（新的上線、確認、撤銷舊的），再查紀錄，最後才清歷史', () => {
  const { options, steps } = readJson(dir, 'incident.json')
  assert.ok(Array.isArray(steps), 'incident.json 要有 steps 陣列')
  const all = Object.keys(options ?? {})
  for (const s of steps) assert.ok(all.includes(s), `${s} 不在 options 裡`)
  const missing = all.filter(s => !steps.includes(s))
  assert.deepEqual(missing, [], `少了 ${missing.join('、')}：每個步驟都要做`)
  assert.equal(new Set(steps).size, steps.length, '有步驟重複了')
  const at = (s: string) => steps.indexOf(s)
  assert.deepEqual(steps.slice(0, 4), ['rotate-new-key', 'deploy-new-key', 'verify-new-key-in-use', 'revoke-old-key'],
    '最先做的是輪替：產生新金鑰 → 部署 → 確認線上在用新的 → 撤銷舊的。先撤銷會讓服務中斷，先清歷史則讓金鑰繼續有效')
  assert.ok(at('review-access-logs') < at('rewrite-history'), '先查使用紀錄、評估損害，再清歷史')
  assert.ok(at('revoke-old-key') < at('rewrite-history'), '清歷史一定在撤銷之後：推出去的就當作已經外洩')
})
