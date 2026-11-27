// 練習 3：決策紀錄（ADR）的結構。測試只檢查有沒有寫完整，不判斷你的結論對不對
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const text = readFileSync(join(import.meta.dirname, 'decision.md'), 'utf8')
// 依「## 標題」切成段落；### 子標題留在所屬的段落裡
const sections = new Map(text.split(/^## /m).slice(1).map(s => {
  const [title, ...body] = s.split('\n')
  return [title.trim(), body.join('\n').trim()] as const
}))
const section = (name: string) => {
  const key = [...sections.keys()].find(k => k.includes(name))
  assert.ok(key, `找不到「## ${name}」這一段：ADR 要有背景、考慮的選項、決定、後果`)
  return sections.get(key)!
}
const length = (s: string) => s.replace(/\s/g, '').length

test('範本的提示都換成自己的內容', () => {
  assert.ok(!text.includes('寫在這裡'), 'decision.md 裡還有「（寫在這裡…）」：每一段都換成你自己的內容')
  assert.match(text, /^狀態：\s*(proposed|accepted)/m, '保留「狀態：proposed」（或 accepted）這一行')
})

test('背景：寫出現況、新需求與限制', () => {
  const s = section('背景')
  assert.ok(length(s) >= 80, '背景至少 80 個字：寫出現在的系統、一年後的規模、新需求（對帳、發票）、團隊與預算')
  const facts = [/POS|對帳/, /發票/, /MAU|活躍使用者|流量|egress/i, /預算|費用|美元|元/, /團隊|工程師/].filter(r => r.test(s)).length
  assert.ok(facts >= 3, '背景要涵蓋課文情境裡至少三類事實：新需求（POS 對帳、發票）、用量（MAU、流量）、預算、團隊')
})

test('考慮的選項：至少三個，各自寫出優點與缺點', () => {
  const options = section('選項').split(/^### /m).slice(1)
  assert.ok(options.length >= 3, `要比較至少三個選項（每個一個 ### 子標題），現在有 ${options.length} 個：繼續用 Supabase、混合、搬離`)
  for (const o of options) {
    const title = o.split('\n')[0]
    assert.ok(length(o) >= 60, `「${title}」寫得太少（至少 60 個字）：怎麼做、優點、缺點`)
    assert.match(o, /優點|好處/, `「${title}」要寫優點`)
    assert.match(o, /缺點|代價|風險/, `「${title}」要寫缺點：每個選項都有代價，沒寫出來代表沒想清楚`)
  }
})

test('決定：用「我們將……」說清楚選了哪一個', () => {
  const s = section('決定')
  assert.match(s, /我們將/, '決定要用完整的句子、主動語態寫：「我們將……」，不寫「建議」「可能」')
  assert.match(s, /選項\s*[A-C]|Supabase|NestJS|混合|搬離/, '決定要指出選了哪一個選項')
})

test('後果：好的、壞的都要寫', () => {
  const s = section('後果')
  const items = s.split('\n').filter(l => /^\s*([-*]|\d+\.)\s+/.test(l))
  assert.ok(items.length >= 3, `後果用條列寫，至少 3 點（現在 ${items.length} 點）`)
  assert.match(s, /代價|缺點|風險|負面|成本/, '後果要寫出負面的影響或代價：沒有負面後果的 ADR 通常是沒想清楚')
})

test('用到課文提供的評估材料', () => {
  const topics = [/連線池|Supavisor|transaction mode|6543/i, /備份|PITR/i, /費用|方案|MAU|egress|美元/i, /pg_dump|搬離|Auth|Storage/i, /advisors|RLS/i]
  const used = topics.filter(r => r.test(text)).length
  assert.ok(used >= 3, `整份 ADR 至少要用到課文「評估的材料」裡的三類（連線池、備份、費用、搬離成本、advisors／RLS），現在用到 ${used} 類`)
})
