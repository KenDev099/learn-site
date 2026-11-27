// 練習 3：scan.sh 用 gitleaks 的 git 模式掃描整個歷史，找出已經被「刪掉」的金鑰
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { requireDocker, run } from '../../helpers/docker.ts'
import { makeRepo } from './leaky-repo.ts'

const dir = import.meta.dirname
const LEAKY = join(dir, 'leaky-repo'), CLEAN = join(dir, '.clean-repo')
let leak: ReturnType<typeof makeRepo>

before(() => {
  requireDocker()
  // 每次都重建：金鑰、檔名、加入的 commit 都不一樣
  leak = makeRepo(LEAKY, true)
  makeRepo(CLEAN, false)
})
after(() => makeRepo(CLEAN, null))

const scan = (repo: string) => {
  const r = run('sh', ['scan.sh', repo], { cwd: dir, timeout: 300_000 })
  let report: any[] | undefined
  try { report = JSON.parse(r.stdout) } catch {}
  assert.ok(Array.isArray(report), `sh scan.sh ${repo} 印出的不是 JSON 陣列（gitleaks 的 --report-format json --report-path -）：\n${(r.stdout || r.stderr).slice(0, 500)}`)
  return { code: r.code, report: report! }
}

test('掃描有外洩的 repo：報告找到已刪除的金鑰，指出加入它的 commit 和檔案', () => {
  const { report } = scan(LEAKY)
  const hit = report.find(f => f.RuleID === 'aws-access-token')
  assert.ok(hit, `報告裡沒有 aws-access-token：金鑰在目前的檔案裡已經刪掉了，要用 gitleaks git（掃每個 commit），不是 dir（只掃目前的檔案）。\n自己看：git -C leaky-repo log --stat`)
  assert.equal(hit.Commit, leak!.sha, `找到的 commit 是 ${hit.Commit}，加入金鑰的是 ${leak!.sha}`)
  assert.equal(hit.File, leak!.file)
})

test('找到機密時 scan.sh 以非 0 結束（CI 才會擋下），報告裡不出現金鑰本身', () => {
  const { code, report } = scan(LEAKY)
  assert.notEqual(code, 0, 'scan.sh 找到機密卻以 0 結束：不要用 --exit-code 0 或 || true 吃掉 gitleaks 的結束碼')
  assert.ok(!JSON.stringify(report).includes(leak!.key), '報告裡看得到完整的金鑰：報告會存成 CI 的 artifact、貼進 issue，加上 --redact')
})

test('掃描乾淨的 repo：以 0 結束、報告是空陣列', () => {
  const { code, report } = scan(CLEAN)
  assert.deepEqual(report, [], '乾淨的 repo 不該有發現')
  assert.equal(code, 0, '乾淨的 repo 要以 0 結束')
})
