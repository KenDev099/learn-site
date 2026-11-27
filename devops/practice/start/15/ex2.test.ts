// 練習 2：label.yml 的三個安全問題。actionlint 與 YAML 檢查之外，還會照 GitHub 的方式把 ${{ }} 換成惡意標題，用 bash 真的執行 run 腳本
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requireDocker, run } from '../../helpers/docker.ts'
import { actionlint, checkPinned, jobsOf, loadWorkflow, stepsOf, triggers } from './workflow.ts'

const dir = import.meta.dirname
let wf: any
let loadError: Error | undefined

before(() => {
  requireDocker()
  try { wf = loadWorkflow(dir, 'label.yml') } catch (e) { loadError = e as Error }
})
const need = () => { if (loadError) throw loadError; return wf }

// GitHub 在執行前就把 ${{ 運算式 }} 換成值，直接貼進腳本文字裡：這裡做一樣的事
function expand(text: string, ctx: any) {
  return text.replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, expr: string) => {
    const v = expr.split('.').reduce((o: any, k) => o?.[k], ctx)
    return v === undefined || v === null ? '' : String(v)
  })
}

// 用某個 PR 標題執行 workflow 裡所有的 run 步驟，回傳 gh 被呼叫的參數與多出來的檔案
function simulate(title: string, number = 42) {
  const ctx = { github: { token: 'fake-token', repository: 'cafe/cafe-api', head_ref: 'feature/x', event: { number, pull_request: { title, number, head: { sha: 'deadbeef', ref: 'feature/x' } } } } }
  const tmp = mkdtempSync(join(tmpdir(), 'ld-15-label-'))
  try {
    const bin = join(tmp, '.bin')
    run('mkdir', [bin])
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\nprintf '%s ' "$@" >> "${join(bin, 'gh.log')}"\necho >> "${join(bin, 'gh.log')}"\n`)
    chmodSync(join(bin, 'gh'), 0o755)
    const errors: string[] = []
    for (const [, job] of jobsOf(need())) for (const s of stepsOf(job)) {
      if (typeof s.run !== 'string') continue
      const env: Record<string, string> = { PATH: `${bin}:/usr/bin:/bin` }
      for (const [k, v] of Object.entries({ ...wf.env, ...job.env, ...s.env })) env[k] = expand(String(v), ctx)
      const r = run('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', expand(s.run, ctx)], { cwd: tmp, env, timeout: 10_000 })
      if (r.code !== 0) errors.push(r.stderr)
    }
    const log = existsSync(join(bin, 'gh.log')) ? readFileSync(join(bin, 'gh.log'), 'utf8').trim() : ''
    return { gh: log, files: readdirSync(tmp).filter(f => f !== '.bin'), errors }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

test('actionlint 沒有找到任何問題（包括「potentially untrusted」）', () => {
  need()
  const r = actionlint(dir, 'label.yml')
  assert.equal(r.code, 0, `actionlint 結束碼 ${r.code}：\n${r.out}`)
})

test('run 裡沒有直接寫 ${{ github.event… }}', () => {
  for (const [id, job] of jobsOf(need())) for (const s of stepsOf(job))
    assert.doesNotMatch(String(s.run ?? ''), /\$\{\{[^}]*github\.(event|head_ref)/, `job ${id} 的 run 直接嵌入了 \${{ github.event… }}：GitHub 會先把標題原文貼進腳本再執行。改成先放進 env（TITLE: \${{ … }}），腳本裡用 "$TITLE"`)
})

test('pull_request_target 底下不 checkout PR 的程式碼', () => {
  if (!('pull_request_target' in triggers(need()))) return
  const why = '這個 workflow 拿得到可寫的 token 與 repo 的機密，PR 作者可以在 package.json、測試或任何會被執行的檔案裡放程式。加標籤只需要事件資料（標題、編號），拿掉 checkout'
  for (const [id, job] of jobsOf(wf)) for (const s of stepsOf(job)) {
    assert.ok(s.uses?.split('@')[0] !== 'actions/checkout', `job ${id} 在 pull_request_target 裡用了 actions/checkout：${why}`)
    assert.doesNotMatch(String(s.run ?? ''), /\bgh\s+pr\s+checkout\b|\bgit\s+(fetch|checkout|switch|pull|clone)\b/, `job ${id} 在 pull_request_target 裡用指令抓 PR 的程式碼：${why}`)
  }
})

test('permissions 只有 pull-requests: write（最多再加 contents: read）', () => {
  for (const [id, job] of jobsOf(need())) {
    const p = job.permissions ?? wf.permissions
    assert.ok(p && typeof p === 'object', `job ${id} 的權限是 ${JSON.stringify(p) ?? '（沒寫，用 repo 預設）'}：寫成 permissions: { pull-requests: write }`)
    assert.equal(p['pull-requests'], 'write', '加標籤需要 pull-requests: write')
    for (const [k, v] of Object.entries(p)) assert.ok(k === 'pull-requests' || (k === 'contents' && v === 'read'), `多給了 ${k}: ${v}：token 被偷走時，能做的事就是這裡寫的權限，只留需要的`)
  }
  checkPinned(wf)
})

test('依標題加標籤的功能還在', () => {
  need()
  const fix = simulate('fix: 拿鐵兩杯算成 330 元')
  assert.deepEqual(fix.errors, [], `run 腳本執行失敗：${fix.errors.join('\n')}`)
  assert.match(fix.gh, /^pr edit 42 --add-label bug\s*$/, `標題 fix: … 應該只執行 gh pr edit 42 --add-label bug，實際上 gh 收到：${fix.gh || '（沒有呼叫）'}`)
  const other = simulate('Fix: 可頌少算一個', 57)
  assert.match(other.gh, /^pr edit 57 --add-label bug\s*$/, `PR #57 的標題 Fix: … 應該執行 gh pr edit 57 --add-label bug（編號要從事件資料來，不能寫死），實際上 gh 收到：${other.gh || '（沒有呼叫）'}`)
  const feat = simulate('feat: 新增起司蛋糕')
  assert.equal(feat.gh, '', `標題 feat: … 不該加標籤，gh 卻收到：${feat.gh}`)
})

test('惡意標題不能執行任何指令', () => {
  need()
  for (const title of ['fix"; touch pwned1; echo "', 'fix $(touch pwned2)', "fix'; touch pwned3; echo '", 'fix `touch pwned4`', 'x\ntouch pwned5'] ) {
    const r = simulate(title)
    assert.deepEqual(r.files, [], `標題 ${JSON.stringify(title)} 在 runner 上建立了 ${r.files.join('、')}：標題被當成腳本的一部分執行了。把它放進 env，腳本裡用 "$TITLE"（雙引號包住變數）`)
  }
})
