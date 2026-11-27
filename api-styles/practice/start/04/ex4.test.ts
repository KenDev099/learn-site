import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const opts = { timeout: 10_000 }
const text = readFileSync(new URL('./explain.md', import.meta.url), 'utf8')
const answers = new Map<number, { method: string, reason: string }>()
for (const m of text.matchAll(/^\s*([123])\s*[:：]\s*([\w-?]+)\s*\|\s*([\w-?]+)\s*$/gm))
  answers.set(Number(m[1]), { method: m[2].toLowerCase(), reason: m[3].toLowerCase() })

const METHODS = ['dataloader', 'join', 'lateral']
const REASONS = ['optional-field', 'per-parent-limit', 'fixed-shape', 'always-faster', 'less-code', 'shared-cache']
const want = [
  { method: 'dataloader', reason: 'optional-field', why: '訂單列表的顧客名稱：查不查 customer 由客戶端決定，resolver 事先不知道；DataLoader 只在真的被查時才批次載入' },
  { method: 'lateral', reason: 'per-parent-limit', why: '每張訂單各取最近 3 個品項：批次後一句 LIMIT 3 只會限制整句，要每組各自 LIMIT，用 LATERAL JOIN（或視窗函式）' },
  { method: 'join', reason: 'fixed-shape', why: '形狀固定、每次都要全部資料：在一個地方寫一句 JOIN 最直接，不需要批次' },
]

test('explain.md 三題都依格式作答', opts, () => {
  for (const n of [1, 2, 3]) {
    const a = answers.get(n)
    assert.ok(a, `explain.md 找不到第 ${n} 題：格式是「${n}: 做法 | 理由代碼」，一題一行`)
    assert.ok(METHODS.includes(a.method), `第 ${n} 題的做法要是 dataloader、join、lateral 其中一個`)
    assert.ok(REASONS.includes(a.reason), `第 ${n} 題的理由代碼「${a.reason}」不在課程頁的表格裡`)
  }
})

for (const [i, w] of want.entries()) {
  test(`第 ${i + 1} 題的做法與理由`, opts, () => {
    const a = answers.get(i + 1)
    assert.ok(a, `explain.md 找不到第 ${i + 1} 題`)
    assert.equal(a.method, w.method, `第 ${i + 1} 題的做法不對。回頭看課程頁「什麼時候不用 DataLoader」那一節的表格`)
    assert.equal(a.reason, w.reason, `第 ${i + 1} 題做法對了，理由代碼不對。${w.why}`)
  })
}
