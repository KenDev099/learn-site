// 練習 3：不究責的事後檢討。只讀 postmortem.md，不需要 Docker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = import.meta.dirname
const SECTIONS = ['摘要', '影響', '時間線', '偵測', '促成因素', '做得好的地方', '可以更好的地方', '改善項目']

// 依「## 標題」切段，去掉 HTML 註解（範本裡的提示不算內容）
function sections(): Map<string, string> {
  let text: string
  try { text = readFileSync(join(dir, 'postmortem.md'), 'utf8') } catch { throw new Error('找不到 postmortem.md') }
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  const map = new Map<string, string>()
  for (const part of text.split(/^## +/m).slice(1)) {
    const nl = part.indexOf('\n')
    map.set(part.slice(0, nl < 0 ? undefined : nl).trim(), nl < 0 ? '' : part.slice(nl + 1).trim())
  }
  return map
}
const section = (name: string) => sections().get(name) ?? ''

test('範本的每一節都在而且有內容', () => {
  const s = sections()
  for (const name of SECTIONS) {
    assert.ok(s.has(name), `少了「## ${name}」這一節`)
    if (name !== '改善項目') assert.ok(s.get(name)!.replace(/\s/g, '').length >= 10, `「${name}」這一節沒有內容（至少寫一兩句）`)
  }
})

test('時間線至少 5 筆，每筆是遞增的 UTC ISO 時間', () => {
  const lines = section('時間線').split('\n').filter(l => /^\s*[-*]\s/.test(l))
  assert.ok(lines.length >= 5, `時間線只有 ${lines.length} 筆，至少要 5 筆（每筆一行「- 2026-11-01T01:29:47Z 發生了什麼」）`)
  let prev = -Infinity
  for (const l of lines) {
    const m = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)\s+\S/.exec(l)
    assert.ok(m, `這一筆開頭不是 UTC 的 ISO 時間：「${l.trim()}」。寫成 2026-11-01T01:29:47Z（結尾的 Z 代表 UTC），不同時區的人讀才不會誤會，也能跟 log 直接對照`)
    const t = Date.parse(m[1])
    assert.ok(!Number.isNaN(t), `時間不合法：${m[1]}`)
    assert.ok(t > prev, `時間線要照時間遞增：「${l.trim()}」比前一筆早或一樣`)
    prev = t
  }
})

test('影響寫出持續幾分鐘、受影響請求的比例', () => {
  const s = section('影響')
  assert.match(s, /\d+(\.\d+)?\s*分鐘/, '影響要寫出持續多久，例如「持續 12 分鐘」')
  assert.match(s, /\d+(\.\d+)?\s*%/, '影響要寫出受影響請求的比例，例如「25% 的請求失敗」')
})

test('至少 3 個改善項目，每個都有類型、負責人與期限', () => {
  const rows = section('改善項目').split('\n').filter(l => l.trim().startsWith('|'))
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    .filter(c => c.length >= 4 && c[0] !== '項目' && !/^:?-+:?$/.test(c[0]))
  assert.ok(rows.length >= 3, `改善項目只有 ${rows.length} 個，至少要 3 個（用範本的表格：| 項目 | 類型 | 負責人 | 期限 |）`)
  for (const [item, type, owner, due] of rows) {
    assert.ok(item.length >= 4, '每個改善項目都要寫要做什麼')
    assert.ok(['prevent', 'detect', 'mitigate'].includes(type), `「${item}」的類型是「${type}」：只能是 prevent（避免再發生）、detect（更早發現）、mitigate（更快止血）`)
    assert.ok(owner && !/^(\?+|tbd|待定|未定|無|n\/a|-+)$/i.test(owner), `「${item}」沒有負責人：沒有人負責的改善項目不會被完成`)
    assert.match(due, /^\d{4}-\d{2}-\d{2}$/, `「${item}」的期限要是 YYYY-MM-DD，例如 2026-11-15`)
    assert.ok(!Number.isNaN(Date.parse(due + 'T00:00:00Z')) && new Date(due + 'T00:00:00Z').toISOString().startsWith(due), `「${item}」的期限 ${due} 不是存在的日期`)
  }
})

test('促成因素不歸咎個人', () => {
  const s = section('促成因素')
  const hit = /人為疏失|人為錯誤|操作錯誤|操作失誤|human error|疏失|疏忽|粗心|大意|不小心|不夠小心|沒注意|沒有注意|沒留意|偷懶|失職|怪罪/.exec(s)
  assert.equal(hit, null, `促成因素出現「${hit?.[0]}」：不究責的檢討問「為什麼系統讓這件事有機會發生」（缺了哪個測試、哪道檢查、哪個預設值），而不是誰不小心`)
})
