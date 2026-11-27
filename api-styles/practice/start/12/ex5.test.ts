import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const opts = { timeout: 10_000 }
const REQUIRED = ['狀態', '背景', '決定', '替代方案', '後果']
// 後果要寫到負面的部分：至少出現一個這些詞
const NEGATIVE = ['代價', '缺點', '成本', '風險', '負擔', '複雜', '維運', '學習曲線', '限制']

const text = readFileSync(new URL('./adr.md', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const sections = new Map<string, string>()
for (const part of text.split(/^##[ \t]+/m).slice(1)) {
  const [title, ...body] = part.split('\n')
  sections.set(title.trim(), body.join('\n').trim())
}
const count = (s: string) => [...s.replace(/\s/g, '')].length

test('五個章節都在，而且都有內容', opts, () => {
  for (const name of REQUIRED) {
    assert.ok(sections.has(name), `adr.md 少了「## ${name}」章節（標題要一字不差）`)
    assert.ok(count(sections.get(name)!) >= 10, `「## ${name}」是空的（或太短）：每個章節都要有內容，註解不算`)
  }
})

test('決定提到三種風格，替代方案至少兩個', opts, () => {
  const decision = sections.get('決定') ?? ''
  for (const style of ['GraphQL', 'gRPC', 'REST']) {
    assert.match(decision, new RegExp(style, 'i'), `「決定」要說明 ${style} 用在哪裡、為什麼`)
  }
  const options = (sections.get('替代方案') ?? '').split('\n').filter(l => /^\s*([-*]|\d+\.)\s+\S/.test(l))
  assert.ok(options.length >= 2, `「替代方案」要列出至少兩個考慮過的方案（每個一行，用 - 或 1. 開頭），目前 ${options.length} 個`)
})

test('後果要寫代價，不能只寫優點', opts, () => {
  const consequences = sections.get('後果') ?? ''
  assert.ok(NEGATIVE.some(w => consequences.includes(w)),
    `「後果」只寫了好處：決定一定有代價，寫出要付出什麼（例如維運三套工具、學習曲線、快取變複雜），可以用這些詞：${NEGATIVE.join('、')}`)
})

test('長度 400 到 2000 字（不含空白與註解）', opts, () => {
  const n = count(text)
  assert.ok(n >= 400, `ADR 只有 ${n} 字：每個章節要寫到別人看得懂為什麼這樣決定（至少 400 字）`)
  assert.ok(n <= 2000, `ADR 有 ${n} 字，超過 2000 字：ADR 要短，細節放設計文件`)
})
