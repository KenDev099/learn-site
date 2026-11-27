import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNodeTests } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const impl = (body: string) => `import { setTimeout } from 'node:timers/promises'
const MENU: Record<string, number> = { 美式咖啡: 80, 拿鐵: 110, 卡布奇諾: 110, 伯爵紅茶: 90, 可頌: 70, 起司蛋糕: 120 }
export async function fetchMenuPrice(name: string): Promise<number> {
  await setTimeout(10)
${body}
}
`
const correct = impl("  const price = MENU[name]\n  if (price === undefined) throw new Error(`菜單上沒有「${name}」`)\n  return price")

async function runSpec(source: string) {
  const spec = await readFile(join(import.meta.dirname, 'broken.spec.ts'), 'utf8')
  const dir = await tmpProject({ 'broken.spec.ts': spec, 'menu-price.ts': source })
  return runNodeTests(join(dir, 'broken.spec.ts'), { cwd: dir })
}

test('broken.spec.ts 只 import node:test、node:assert 和 fetchMenuPrice，而且只呼叫它', opts, async () => {
  const spec = await readFile(join(import.meta.dirname, 'broken.spec.ts'), 'utf8')
  const code = spec.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/.*$/gm, '')   // 註解不算
  const from = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? m[2])
  for (const f of from) assert.ok(['node:test', 'node:assert', 'node:assert/strict', './menu-price.ts'].includes(f), `不能 import「${f}」：只能用 node:test、node:assert/strict 和 './menu-price.ts'`)
  assert.match(code, /import\s*\{\s*fetchMenuPrice\s*\}\s*from\s*['"]\.\/menu-price\.ts['"]/, "要寫 import { fetchMenuPrice } from './menu-price.ts'（不要改名、不要 import *）")
  assert.equal(from.filter(f => f === './menu-price.ts').length, 1, "'./menu-price.ts' 只能 import 一次")
  const bad = code.match(/\bimport\s*\(|\b(toString|getBuiltinModule|createRequire|readFile\w*)\b/)
  assert.equal(bad, null, `不能用「${bad?.[0]}」：測試要靠呼叫 fetchMenuPrice(…) 檢查結果，不能去讀程式的原始碼`)
  const uses = code.replace(/import\s*\{\s*fetchMenuPrice\s*\}/, '').match(/\bfetchMenuPrice\b(?!\s*\()/)
  assert.equal(uses, null, 'fetchMenuPrice 只能直接呼叫，寫成 fetchMenuPrice(…)：不要把它轉成字串、指定給別的變數或讀它的屬性')
})

test('配上正確的 menu-price.ts：至少 2 個測試，全部通過', opts, async () => {
  const r = await runSpec(correct)
  assert.equal(r.fail, 0, `正確的程式也有測試沒過，是測試寫錯了：\n${r.stdout.split('\n').filter(l => /^not ok|^\s+(actual|expected|error):/.test(l)).slice(0, 12).join('\n')}`)
  assert.equal(r.code, 0, `node --test broken.spec.ts 沒有成功結束：\n${r.stderr.slice(0, 600)}`)
  assert.ok(r.pass >= 2, `至少要有 2 個測試（價格、查不到的品項），現在只有 ${r.pass} 個`)
})

test('抓得到這個 bug：價格算錯（多加了一成）', opts, async () => {
  const r = await runSpec(impl("  const price = MENU[name]\n  if (price === undefined) throw new Error(`菜單上沒有「${name}」`)\n  return Math.round(price * 1.1)"))
  assert.ok(r.fail > 0 || r.code !== 0, '拿鐵查出 121 元，你的測試還是通過：要 await 拿到真正的數字，再用 assert.equal 比對 110')
})

test('抓得到這個 bug：查不到的品項沒有丟錯（就是 menu-price.ts 現在的 bug）', opts, async () => {
  const r = await runSpec(impl('  return MENU[name]'))
  assert.ok(r.fail > 0 || r.code !== 0, 'fetchMenuPrice(\'珍珠奶茶\') 回傳 undefined、沒有丟錯，你的測試還是通過：用 await assert.rejects(…) 要求它一定要丟錯，斷言不能只寫在 catch 裡')
})
