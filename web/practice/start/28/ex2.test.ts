// 驗收報告（REPORT.md）的結構檢查。內容寫得好不好，用課程頁的自我檢核表判斷
// 會用 ex1 的驗收結果（檔案沒改過就沿用 .acceptance.json，改過就重跑）：自動檢查沒過的項目，報告不能寫「通過」
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { CODES, cachedAcceptance } from './ex1.test.ts'

const HEADINGS = ['摘要', '範圍', '方法', '結果', '未通過與已知問題', '下一步']
const md = existsSync('REPORT.md') ? readFileSync('REPORT.md', 'utf8').replace(/<!--[\s\S]*?-->/g, '') : ''
const sections: Record<string, string> = {}
for (const part of md.split(/^## /m).slice(1)) {
  const [title, ...body] = part.split('\n')
  sections[title.trim()] = body.join('\n').trim()
}
// 結果表：| 代碼 | 驗收標準 | 結果 | 證據 |
const rows = new Map<string, { result: string, evidence: string }>()
for (const line of (sections['結果'] ?? '').split('\n')) {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim())
  if (cells.length >= 4 && /^[RAPS]\d$/.test(cells[0])) rows.set(cells[0], { result: cells[2], evidence: cells[3] })
}

test('二級標題剛好是範本的 6 個，順序相同', () => {
  const got = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1].trim())
  assert.deepEqual(got, HEADINGS, `## 標題要依序是：${HEADINGS.join('、')}`)
})

test('摘要不超過 3 句', () => {
  const s = sections['摘要'] ?? ''
  assert.ok(s.length > 0, '摘要是空的：用 1～3 句寫出結論（能不能上線）、通過幾項、有什麼要注意的')
  const n = s.split(/[。！？!?]/).filter(x => x.trim()).length
  assert.ok(n <= 3, `摘要有 ${n} 句，最多 3 句：讀報告的人通常只看這一段`)
})

test('方法寫出自動檢查的指令與手動檢查清單', () => {
  const s = sections['方法'] ?? ''
  assert.ok(s.includes('node check.mjs web 28'), '方法要寫出自動檢查的指令 node check.mjs web 28，別人才能重跑')
  for (const [k, re] of [['鍵盤', /鍵盤/], ['螢幕閱讀器（VoiceOver 等）', /VoiceOver|螢幕閱讀器|NVDA|TalkBack/i], ['200% 字級', /200\s*%/], ['深色模式', /深色/]] as const)
    assert.match(s, re, `手動檢查清單少了「${k}」`)
})

test('結果表列出全部 14 個驗收項目，每列有結果與證據', () => {
  const missing = CODES.filter(c => !rows.has(c))
  assert.deepEqual(missing, [], '結果表少了這些代碼（每列格式：| 代碼 | 驗收標準 | 結果 | 證據 |）')
  for (const [code, r] of rows) {
    assert.ok(r.result === '通過' || r.result === '未通過', `${code} 的結果要寫「通過」或「未通過」，現在是「${r.result}」`)
    assert.ok(r.evidence.length >= 4 && !/^(ok|pass|通過|沒問題|無|-+)$/i.test(r.evidence), `${code} 的證據「${r.evidence}」太空泛：寫出是哪個測試、量到什麼，或截圖檔名`)
  }
})

test('字數在 400～3000 字之間', () => {
  const n = md.replace(/[\s|#*`\-]/g, '').length
  assert.ok(n >= 400 && n <= 3000, `報告有 ${n} 字（不含空白與 Markdown 符號），要在 400～3000 之間`)
})

let problems: Record<string, string[]>
before(async () => { problems = await cachedAcceptance() }, { timeout: 180_000 })

test('自動檢查沒過的項目，報告沒有寫成「通過」', () => {
  const lies = CODES.filter(c => problems[c].length && rows.get(c)?.result === '通過')
  assert.deepEqual(lies, [], `這些項目的自動檢查沒過，報告卻寫「通過」：改成「未通過」並寫進「未通過與已知問題」，或先修好（第一個問題：${lies.map(c => problems[c][0]).join('；')}）`)
})

test('未通過的項目都寫進「未通過與已知問題」，並有負責人與預計處理時間', () => {
  const s = sections['未通過與已知問題'] ?? ''
  assert.ok(s.length > 0, '「未通過與已知問題」是空的：沒有問題也要寫「無」，有的話寫影響、風險、負責人、預計處理時間')
  const failed = [...rows].filter(([, r]) => r.result === '未通過').map(([c]) => c)
  for (const c of failed) assert.ok(s.includes(c), `${c} 標成未通過，但「未通過與已知問題」沒有提到 ${c}`)
  if (failed.length || !/^無[。.]?$/.test(s)) for (const k of ['影響', '風險', '負責人', '預計'])
    assert.ok(s.includes(k), `每個未通過或已知問題都要寫「${k}」`)
})
