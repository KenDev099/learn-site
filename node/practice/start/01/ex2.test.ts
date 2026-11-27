import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const here = (f: string) => join(import.meta.dirname, f)
const opts = { timeout: 15_000 }
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

// 在 import 失敗時給看得懂的訊息（每個測試自己 import，一題壞掉不會拖累其他測試）
async function loadPrice() {
  const mod: { lineTotal?: unknown } = await import('./price.ts')
  assert.equal(typeof mod.lineTotal, 'function', 'price.ts 要 export function lineTotal(price, qty)')
  return mod.lineTotal as (price: number, qty: number) => number
}

test('lineTotal(price, qty) 回傳 price × qty', opts, async () => {
  const lineTotal = await loadPrice()
  const price = rand(50, 150), qty = rand(1, 9)
  assert.equal(lineTotal(price, qty), price * qty, `lineTotal(${price}, ${qty}) 要是 ${price * qty}`)
  assert.equal(lineTotal(110, 1), 110)
})

test('qty 不是正整數（0、-1、1.5）時丟出 RangeError', opts, async () => {
  const lineTotal = await loadPrice()
  for (const qty of [0, -1, 1.5]) {
    assert.throws(() => lineTotal(80, qty), RangeError, `lineTotal(80, ${qty}) 要 throw new RangeError(…)，不能回傳數字或 NaN`)
  }
})

test('receipt.ts 用 lineTotal 印出收據（換一張訂單也對）', opts, async () => {
  const items = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'].sort(() => Math.random() - 0.5).slice(0, 3)
  const orders = items.map(name => ({ name, price: rand(6, 13) * 10, qty: rand(1, 4) }))
  // 把你的 receipt.ts、price.ts 和一張新的訂單放進暫存資料夾執行
  const files = {
    'receipt.ts': await readFile(here('receipt.ts'), 'utf8'),
    'price.ts': await readFile(here('price.ts'), 'utf8'),
    'orders.ts': `export const orders = ${JSON.stringify(orders)}\n`,
  }
  const r = await runNode(join(await tmpProject(files), 'receipt.ts'))
  assert.equal(r.code, 0, `node receipt.ts 出錯了：\n${r.stderr.split('\n').slice(0, 6).join('\n')}`)
  const want = orders.map(o => `${o.name} ×${o.qty} = ${o.price * o.qty}`).concat(`合計 ${orders.reduce((s, o) => s + o.price * o.qty, 0)}`)
  assert.equal(r.stdout, want.join('\n') + '\n', '每一行「品名 ×數量 = 小計」，最後一行「合計 總額」，不要多印別的；資料要從 orders.ts 讀，不能寫死')

  // 換成會把小計乘以 10 的 lineTotal：每一行和合計都要跟著變，才代表真的用了 price.ts 的 lineTotal
  files['price.ts'] = 'export const lineTotal = (price: number, qty: number) => price * qty * 10\n'
  const r2 = await runNode(join(await tmpProject(files), 'receipt.ts'))
  const want10 = orders.map(o => `${o.name} ×${o.qty} = ${o.price * o.qty * 10}`).concat(`合計 ${orders.reduce((s, o) => s + o.price * o.qty * 10, 0)}`)
  assert.equal(r2.stdout, want10.join('\n') + '\n', 'receipt.ts 的小計要呼叫 price.ts 匯出的 lineTotal 來算，合計要把這些小計加起來，不要自己再寫一次 price * qty')
})
