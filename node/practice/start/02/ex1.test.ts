import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNode } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

// 每次換一份價目表：飲料、價格、尺寸加價都不一樣，寫死的輸出過不了
async function setup() {
  const drinks = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '焦糖瑪奇朵'].sort(() => Math.random() - 0.5).slice(0, 3)
  const menu = Object.fromEntries(drinks.map(d => [d, rand(7, 14) * 10]))
  const sizeExtra = { S: -rand(1, 2) * 5, M: 0, L: rand(2, 6) * 5 }
  const dir = await tmpProject({
    'order.ts': await readFile(join(import.meta.dirname, 'order.ts'), 'utf8'),
    'menu.ts': `export const menu: Record<string, number> = ${JSON.stringify(menu)}\nexport const sizeExtra: Record<string, number> = ${JSON.stringify(sizeExtra)}\n`,
  })
  const order = (args: string[]) => runNode(join(dir, 'order.ts'), { args })
  return { drinks, menu, sizeExtra, order }
}

test('完整參數：印出「品項 尺寸 ×數量 = 金額」', opts, async () => {
  const { drinks, menu, sizeExtra, order } = await setup()
  const qty = rand(2, 5)
  const r = await order(['--drink', drinks[0], '--size', 'L', '--qty', String(qty)])
  assert.equal(r.code, 0, `程式出錯了，stderr：${r.stderr}`)
  assert.equal(r.stdout, `${drinks[0]} L ×${qty} = ${(menu[drinks[0]] + sizeExtra.L) * qty}\n`, '金額 = (menu[品項] + sizeExtra[尺寸]) × 數量，價格要從 menu.ts 讀（測試會換價目表），只印這一行')
  assert.equal(r.stderr, '', '正確用法時 stderr 不要有東西')
})

test('-q 是 --qty 的縮寫，--size 預設 M、--qty 預設 1', opts, async () => {
  const { drinks, menu, sizeExtra, order } = await setup()
  const r1 = await order(['--drink', drinks[1], '-q', '3', '--size', 'S'])
  assert.equal(r1.stdout, `${drinks[1]} S ×3 = ${(menu[drinks[1]] + sizeExtra.S) * 3}\n`, 'parseArgs 的 qty 要設定 short: \'q\'')
  const r2 = await order([`--drink=${drinks[2]}`])
  assert.equal(r2.stdout, `${drinks[2]} M ×1 = ${menu[drinks[2]]}\n`, '沒給 --size 時是 M、沒給 --qty 時是 1：用 parseArgs 的 default')
})

const bad: [string, (d: string) => string[]][] = [
  ['未知選項 --tip', d => ['--drink', d, '--tip', '10']],
  ['多出來的字', d => ['--drink', d, '外帶']],
  ['沒給 --drink', () => ['--size', 'L']],
  ['沒有的品項', () => ['--drink', '珍珠奶茶']],
  ['尺寸 XL', d => ['--drink', d, '--size', 'XL']],
  ['數量 2abc', d => ['--drink', d, '--qty', '2abc']],
  ['數量 0', d => ['--drink', d, '--qty', '0']],
  ['數量 1.5', d => ['--drink', d, '-q', '1.5']],
  ['數量是空字串', d => ['--drink', d, '--qty', '']],
  ['數量 -1', d => ['--drink', d, '--qty=-1']],
  ['數量 1e1：要先檢查格式，不能只看 Number() 的結果', d => ['--drink', d, '--qty', '1e1']],
  ['品項 toString：物件從原型繼承來的屬性不是品項', () => ['--drink', 'toString']],
  ['尺寸 constructor：物件從原型繼承來的屬性不是尺寸', d => ['--drink', d, '--size', 'constructor']],
]

test('錯誤用法：stdout 空的、stderr 印說明和用法、結束碼 2', opts, async () => {
  const { drinks, order } = await setup()
  for (const [label, args] of bad) {
    const a = args(drinks[0])
    const r = await order(a)
    const cmd = `node order.ts ${a.map(s => JSON.stringify(s)).join(' ')}（${label}）`
    assert.doesNotMatch(r.stderr, /^\s+at /m, `${cmd}：不要讓例外直接丟出去（stderr 出現了 stack trace），parseArgs 的錯誤也要 try/catch 接住`)
    assert.equal(r.stdout, '', `${cmd}：stdout 不能有東西，錯誤訊息要用 console.error 印到 stderr`)
    assert.match(r.stderr, /用法/, `${cmd}：stderr 要印出錯在哪，再印用法（usage）`)
    assert.ok(r.stderr.split('\n').some(l => l.trim() !== '' && !l.includes('用法')), `${cmd}：只印用法不夠，還要有一行說明錯在哪，例如「沒有這個品項：珍珠奶茶」`)
    assert.equal(r.code, 2, `${cmd}：結束碼要是 2（用法錯誤），收到 ${r.code}；用 process.exitCode = 2`)
  }
})
