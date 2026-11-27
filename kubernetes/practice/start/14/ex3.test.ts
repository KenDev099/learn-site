// 練習 3：事故紀錄 INCIDENT.md：時間軸、影響、偵測、根因、修正、行動項目
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readJson, readText } from '../../helpers/k8s.ts'
import { CAUSES, EXPECTED, GROUPS } from './lib.ts'

const HEADINGS = ['時間軸', '影響', '偵測', '根因', '修正', '行動項目']

// 依「## 標題」切段，去掉 HTML 註解
function sections(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  let cur = ''
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) { cur = h[1]; out[cur] = ''; continue }
    if (cur) out[cur] += line + '\n'
  }
  return out
}

test('INCIDENT.md：六個段落都有實際內容，根因與 diagnosis.json 一致，有可以自動化的預防措施', { timeout: 10_000 }, () => {
  const s = sections(readText(import.meta.dirname, 'INCIDENT.md'))
  for (const h of HEADINGS) assert(h in s, `INCIDENT.md 少了「## ${h}」這一段（標題文字照起始檔，不要改）`)
  for (const h of ['影響', '偵測', '修正']) assert(s[h].replace(/\s/g, '').length >= 10, `「${h}」還沒寫內容（至少一兩句具體的描述）`)

  const times = s['時間軸'].split('\n').filter(l => /\b\d{1,2}:\d{2}\b/.test(l))
  assert(times.length >= 4, `時間軸只有 ${times.length} 個時間點：至少寫 4 個（發生、發現、找到原因、止血或修好），每行一個，例如「- 14:05 部署 v1.0」`)

  const diag = readJson(import.meta.dirname, 'diagnosis.json')
  const root = s['根因']
  const codes = CAUSES.filter(c => root.includes(c))
  assert(codes.length, '根因一節沒有寫出根因代碼：寫「CrashLoopBackOff」「起不來」是症狀，要寫是哪一個設定錯了（diagnosis.json 裡那一組的 cause），再說明它為什麼造成這個症狀')
  const ok = codes.find(c => GROUPS.some(g => diag[g]?.cause === c && EXPECTED[g].cause === c))
  assert(ok, `根因一節寫的 ${codes.join('、')} 對不上 diagnosis.json 裡任何一組（正確的）cause：事故紀錄要寫你在練習 1 實際查到的那一組`)

  const items = s['行動項目'].split('\n').filter(l => /^\s*([-*]|\d+\.)\s+\S/.test(l))
  assert(items.length >= 2, `行動項目只有 ${items.length} 條：至少 2 條，每條用 - 開頭，寫具體要做的事`)
  assert(items.some(l => /CI|檢查|policy|kubeconform|lint|admission/i.test(l)),
    '行動項目要有至少一條自動化的檢查（CI、kubeconform、policy…），讓同樣的錯在進叢集前就被擋下；「多注意」「已修復」不算預防')
})
