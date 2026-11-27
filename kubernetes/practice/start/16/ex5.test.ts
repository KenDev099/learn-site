// 練習 5：文件。RUNBOOK.md 五節各有可以直接執行的指令（namespace、release 跟 deploy.sh 一致）；DECISIONS.md 至少 3 個 ADR
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readText, run } from '../../helpers/k8s.ts'
import { DIR, sections } from './lib.ts'

const RUNBOOK = ['部署', '回滾', '擴展', '處理 CrashLoopBackOff', '輪替資料庫密碼']
const ADR = ['背景', '決策', '後果', '在 EKS 上']
// 不屬於任何 namespace 的指令
const CLUSTER_SCOPED = /\bkubectl\s+(config|version|cluster-info|api-resources|(get|describe|top)\s+(nodes?|no)\b|drain|cordon|uncordon)|\bhelm\s+(version|template|lint|repo|show|search)\b/
const NS = /(-n|--namespace)[ =]+("?\$\{?NS\}?"?|k8s-16)(\s|$|;|\|)/

const blocks = (body: string) => [...body.matchAll(/```(?:bash|sh|shell)?\n([\s\S]*?)```/g)].map(m => m[1])
const commands = (code: string) => code.split('\n').map(l => l.replace(/(^|\s)#.*$/, '').trim()).filter(Boolean)

test('RUNBOOK.md：五節都有可以直接執行的指令區塊，namespace 用 k8s-16（或 $NS）、release 用 cafe，語法正確', { timeout: 30_000 }, () => {
  const secs = Object.fromEntries(sections(readText(DIR, 'RUNBOOK.md'), '##'))
  for (const h of RUNBOOK) {
    assert(h in secs, `RUNBOOK.md 少了「## ${h}」這一節（標題照起始檔）`)
    const code = blocks(secs[h]).join('\n')
    const cmds = commands(code)
    assert(cmds.length, `「${h}」還沒有指令：寫一個 \`\`\`bash 區塊，放半夜被叫起來的人可以直接複製執行的指令`)
    const syntax = run('bash', ['-n'], { input: code })
    assert.equal(syntax.code, 0, `「${h}」的指令有 bash 語法錯誤：${syntax.stderr}`)
    for (const line of cmds.flatMap(l => l.split(/\|/))) {
      if (!/\b(kubectl|helm)\s/.test(line) || CLUSTER_SCOPED.test(line)) continue
      assert(NS.test(line), `「${h}」的這行沒有指定 namespace：${line.trim()}\n沒寫 -n 會打到 default（或你目前 context 的 namespace）。每個指令都明寫 -n k8s-16`)
      if (/\bhelm\s+(upgrade|rollback|history|status|get|uninstall)\b/.test(line))
        assert.match(line, /\bcafe\b/, `「${h}」的 helm 指令要用 release 名稱 cafe（跟 deploy.sh 一樣）：${line.trim()}`)
    }
  }
  const crash = commands(blocks(secs['處理 CrashLoopBackOff']).join('\n')).join('\n')
  assert.match(crash, /logs\b.*(--previous|\s-p\b)/, '「處理 CrashLoopBackOff」要有 kubectl logs --previous：崩潰的原因在上一次容器的 log（第 14 課）')
  assert.match(crash, /\bdescribe\b/, '「處理 CrashLoopBackOff」要有 kubectl describe pod：看 Last State 的 reason 與 exit code')
  const rotate = commands(blocks(secs['輪替資料庫密碼']).join('\n')).join('\n')
  assert.match(rotate, /secret/i, '「輪替資料庫密碼」要有更新 Secret cafe-secrets 的指令')
  assert.match(rotate, /rollout\s+restart\b[^\n]*cafe-api/, '「輪替資料庫密碼」更新 Secret 之後要 kubectl rollout restart deployment/cafe-api：環境變數只在容器啟動時讀一次，不重啟的 Pod 還拿著舊密碼（第 6 課）')
  assert.match(rotate, /rollout\s+restart\b[^\n]*cafe-worker/, '「輪替資料庫密碼」也要 rollout restart deployment/cafe-worker')
})

test('DECISIONS.md：至少 3 個 ADR，每個都有背景、決策、後果、在 EKS 上的做法', { timeout: 10_000 }, () => {
  const adrs = sections(readText(DIR, 'DECISIONS.md'), '##')
  assert(adrs.length >= 3, `DECISIONS.md 只有 ${adrs.length} 個 ADR（## 開頭的標題）：至少寫 3 個`)
  for (const [title, body] of adrs) {
    const s = Object.fromEntries(sections(body, '###'))
    for (const h of ADR) {
      assert(h in s, `ADR「${title}」少了「### ${h}」：${h === '後果' ? '沒有寫代價的決策紀錄，一年後的人不知道當初接受了什麼' : '四個小節都要有'}`)
      assert(s[h].replace(/\s/g, '').length >= 15, `ADR「${title}」的「${h}」太短：寫出具體的內容（至少一兩句）`)
    }
  }
})
