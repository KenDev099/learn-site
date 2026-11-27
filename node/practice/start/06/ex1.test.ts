import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNodeTests } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const correct = await readFile(join(import.meta.dirname, 'order-total.ts'), 'utf8')

// 改壞的版本（變異）：你的測試要每一個都抓得到
function mutate(from: string, to: string) {
  assert.ok(correct.includes(from), `order-total.ts 被改過了，找不到「${from}」：刪掉 work/06/order-total.ts 再跑一次 check.mjs 就會補回來`)
  return correct.replace(from, to)
}
const mutants: [string, () => string][] = [
  ['滿額門檻寫成 > 300（剛好 300 元沒有折）', () => mutate('total >= 300', 'total > 300')],
  ['先判斷滿額再打折', () => mutate(
    "  if (coupon?.toUpperCase() === 'LATTE10') total *= 0.9\n  if (total >= 300) total -= 30\n",
    "  if (total >= 300) total -= 30\n  if (coupon?.toUpperCase() === 'LATTE10') total *= 0.9\n")],
  ['沒有四捨五入', () => mutate('return Math.round(total)', 'return total')],
  ['數量 0 沒有丟錯（寫成 qty < 0）', () => mutate('qty <= 0', 'qty < 0')],
  ['數量 1.5 沒有丟錯（沒檢查整數）', () => mutate('!Number.isInteger(qty) || ', '')],
  ['優惠碼分大小寫（latte10 沒有打折）', () => mutate("coupon?.toUpperCase() === 'LATTE10'", "coupon === 'LATTE10'")],
]

async function runSpec(impl: string) {
  const spec = await readFile(join(import.meta.dirname, 'order-total.spec.ts'), 'utf8')
  const dir = await tmpProject({ 'order-total.spec.ts': spec, 'order-total.ts': impl })
  return runNodeTests(join(dir, 'order-total.spec.ts'), { cwd: dir })
}

test('order-total.spec.ts 只 import node:test、node:assert 和 calcOrderTotal，而且只呼叫它', opts, async () => {
  const spec = await readFile(join(import.meta.dirname, 'order-total.spec.ts'), 'utf8')
  const code = spec.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/.*$/gm, '')   // 註解不算
  const from = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? m[2])
  for (const f of from) assert.ok(['node:test', 'node:assert', 'node:assert/strict', './order-total.ts'].includes(f), `不能 import「${f}」：只能用 node:test、node:assert/strict 和 './order-total.ts'`)
  assert.match(code, /import\s*\{\s*calcOrderTotal\s*\}\s*from\s*['"]\.\/order-total\.ts['"]/, "要寫 import { calcOrderTotal } from './order-total.ts'（不要改名、不要 import *）")
  assert.equal(from.filter(f => f === './order-total.ts').length, 1, "'./order-total.ts' 只能 import 一次：import { calcOrderTotal } from './order-total.ts'")
  const bad = code.match(/\bimport\s*\(|\b(toString|getBuiltinModule|createRequire|readFile\w*)\b/)
  assert.equal(bad, null, `不能用「${bad?.[0]}」：測試要靠呼叫 calcOrderTotal(…) 檢查結果，不能去讀程式的原始碼`)
  const uses = code.replace(/import\s*\{\s*calcOrderTotal\s*\}/, '').match(/\bcalcOrderTotal\b(?!\s*\()/)
  assert.equal(uses, null, 'calcOrderTotal 只能直接呼叫，寫成 calcOrderTotal(…)：不要把它轉成字串、指定給別的變數或讀它的屬性')
})

test('配上正確的 order-total.ts：至少 5 個測試，全部通過', opts, async () => {
  const r = await runSpec(correct)
  assert.equal(r.fail, 0, `正確的程式也有測試沒過，是測試的預期值寫錯了：\n${r.stdout.split('\n').filter(l => /^not ok|^\s+(actual|expected|error):/.test(l)).slice(0, 12).join('\n')}`)
  assert.equal(r.code, 0, `node --test order-total.spec.ts 沒有成功結束：\n${r.stderr.slice(0, 600)}`)
  assert.ok(r.pass >= 5, `至少要有 5 個測試，現在只有 ${r.pass} 個`)
})

for (const [label, make] of mutants) {
  test(`抓得到這個 bug：${label}`, opts, async () => {
    const r = await runSpec(make())
    assert.ok(r.fail > 0 || r.code !== 0, `把 order-total.ts 改成「${label}」之後，你的測試還是全部通過。補一個會因為這個 bug 而失敗的測試`)
  })
}
