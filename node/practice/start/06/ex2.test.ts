import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'

const opts = { timeout: 15_000 }
const MENU: Record<string, number> = { 美式咖啡: 80, 拿鐵: 110, 卡布奇諾: 110, 伯爵紅茶: 90, 可頌: 70, 起司蛋糕: 120 }
const rand = (n: number) => Math.floor(Math.random() * n)
const pad = () => ['', ' ', '　', '　　', ' 　'][rand(5)]

type Line = { name: string, qty: number }
async function load() {
  const mod: { checkout?: unknown } = await import('./checkout.ts')
  assert.equal(typeof mod.checkout, 'function', 'checkout.ts 要 export function checkout(lines)')
  const { UnknownItemError } = await import('./errors.ts')
  return { checkout: mod.checkout as (lines: Line[]) => number, UnknownItemError }
}

test('品名前後有全形或半形空白也能結帳', opts, async () => {
  const { checkout } = await load()
  for (let round = 0; round < 5; round++) {
    const names = Object.keys(MENU).sort(() => Math.random() - 0.5).slice(0, 3)
    const lines = names.map(name => ({ name: pad() + name + pad(), qty: 1 + rand(4) }))
    const want = lines.reduce((s, l) => s + MENU[l.name.trim()] * l.qty, 0)
    const before = structuredClone(lines)
    assert.equal(checkout(lines), want, `checkout(${JSON.stringify(before)}) 要是 ${want}：比對前先把品名前後的空白去掉`)
    assert.deepEqual(lines, before, '不要改到傳進來的 lines（例如 line.name = …）：去掉空白的結果放在新的變數裡')
  }
})

test('菜單上沒有的品項丟出 UnknownItemError，訊息含品名', opts, async () => {
  const { checkout, UnknownItemError } = await load()
  const name = ['珍珠奶茶', '抹茶拿鐵', '肉桂捲'][rand(3)] + (100 + rand(900))
  const lines = [{ name: '拿鐵', qty: 1 }, { name: '　' + name + '　', qty: 2 }]
  assert.throws(() => checkout(lines), (err: unknown) => {
    assert.ok(!(err instanceof TypeError), `丟出的是 TypeError（${(err as Error).message}）：找不到品項時要自己 throw new UnknownItemError(品名)`)
    assert.ok(err instanceof UnknownItemError, "要丟出 errors.ts 的 UnknownItemError：import { UnknownItemError } from './errors.ts'")
    assert.match(err.message, new RegExp(name), `錯誤訊息要包含品名「${name}」：new UnknownItemError(品名)`)
    return true
  }, `${name} 不在菜單上，checkout 要丟出錯誤，不能回傳數字（不要用 try/catch 或 ?. 把錯誤吞掉）`)
})

test('node checkout.ts 印出 合計 370', opts, async () => {
  const r = await runNode(join(import.meta.dirname, 'checkout.ts'), { cwd: import.meta.dirname })
  assert.equal(r.code, 0, `node checkout.ts 出錯了：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  assert.equal(r.stdout, '合計 370\n')
})
