import '../../helpers/offline.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 解析 LAUNCH.md：依 # 與 ## 標題分節（HTML 註解不算內容）。只檢查格式與必填的數字，內容好不好看課文的評分表自評
const md = readFileSync(new URL('./LAUNCH.md', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const sections = new Map<string, string>()
let h1 = ''
let key = ''
for (const line of md.split('\n')) {
  if (/^# /.test(line)) { h1 = line.startsWith('# ADR') ? 'ADR' : 'CHECKLIST'; key = ''; continue }
  const h2 = line.match(/^## (.+)$/)
  if (h2) { key = `${h1}/${h2[1].trim()}`; sections.set(key, ''); continue }
  if (key) sections.set(key, sections.get(key) + line + '\n')
}
const get = (k: string) => {
  const body = sections.get(k)
  assert.ok(body !== undefined, `LAUNCH.md 少了「## ${k.split('/')[1]}」這一節（標題文字不要改）`)
  assert.ok(body.trim() !== '', `「${k.split('/')[1]}」是空的`)
  assert.doesNotMatch(body, /TODO/, `「${k.split('/')[1]}」還有 TODO：把範本的 TODO 換成你的內容`)
  return body
}
const items = (body: string) => body.split('\n').filter(l => /^\s*[-*] \S/.test(l)).map(l => l.replace(/^\s*[-*] /, '').trim())

test('上線檢查清單：每一節都填了，沒有留下 TODO', () => {
  for (const k of ['權限', '預算', '告警', '回退', '資料保留', '已知限制']) get(`CHECKLIST/${k}`)
})

test('預算要有具體的金額', () => {
  const body = get('CHECKLIST/預算')
  assert.match(body, /\d/, '預算要寫出數字（例如每天上限 30 美元），「控制成本」不算預算')
  assert.match(body, /\$|美元|USD|元/i, '預算的數字要有單位（美元、元）')
})

test('告警要有門檻數字，資料保留要寫幾天', () => {
  assert.match(get('CHECKLIST/告警'), /\d/, '告警要寫出門檻（例如錯誤率超過 5%）')
  assert.match(get('CHECKLIST/資料保留'), /\d+\s*天/, '資料保留要寫幾天（例如 30 天）')
})

test('已知限制至少 3 點（用 - 開頭的清單）', () => {
  const list = items(get('CHECKLIST/已知限制'))
  assert.ok(list.length >= 3, `已知限制只有 ${list.length} 點：至少寫 3 點，每點一行，以「- 」開頭`)
})

test('ADR：背景、決定、其他方案、後果都填了', () => {
  for (const k of ['背景', '決定', '考慮過的其他方案', '後果']) get(`ADR/${k}`)
})

test('ADR 的其他方案至少 2 個，每個都寫出沒選它的理由', () => {
  const list = items(get('ADR/考慮過的其他方案'))
  assert.ok(list.length >= 2, `其他方案只有 ${list.length} 個：至少列 2 個（只有一個選項的決定不需要 ADR）`)
  for (const item of list) {
    const reason = item.split(/[：:]/).slice(1).join('：').trim()
    assert.ok([...reason].length >= 8, `「${item.slice(0, 20)}」要寫成「方案：理由」，冒號後面寫出為什麼沒選它（至少 8 個字）`)
  }
})
