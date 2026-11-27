import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { run, runNode } from '../../helpers/proc.ts'

const here = (f: string) => join(import.meta.dirname, f)
const opts = { timeout: 15_000 }
const tsc = join(import.meta.dirname, '../../node_modules/.bin/tsc')
const firstLines = (s: string) => s.split('\n').filter(l => /Error|error|\^/.test(l)).slice(0, 4).join('\n')

type OrderLike = { customer: string, status: string, total(): number, advance(): void, summary(): string }

test('node order-module/main.ts 直接執行，輸出跟改寫前預期的一樣', opts, async () => {
  const r = await runNode(here('order-module/main.ts'))
  assert.equal(r.code, 0, `node order-module/main.ts 還跑不起來：\n${firstLines(r.stderr)}`)
  assert.equal(r.stdout, '王小明：290 元（pending）\n王小明：290 元（ready）\n請到櫃台取餐\n', '行為要跟原本一樣，只改語法')
})

test('OrderStatus 改成 as const 物件，值不變', opts, async () => {
  const mod: { OrderStatus?: unknown, nextStatus?: unknown } = await import('./order-module/status.ts')
  assert.deepEqual(mod.OrderStatus, { Pending: 'pending', Brewing: 'brewing', Ready: 'ready', PickedUp: 'picked_up' },
    'status.ts 要 export const OrderStatus = { Pending: \'pending\', … } as const，鍵和值都跟原本的 enum 一樣')
  assert.equal(typeof mod.nextStatus, 'function', 'status.ts 要繼續 export nextStatus')
  const nextStatus = mod.nextStatus as (s: string) => string | null
  assert.equal(nextStatus('brewing'), 'ready')
  assert.equal(nextStatus('picked_up'), null)
})

test('Order 換一位顧客、換一張訂單也對', opts, async () => {
  const mod: { Order?: unknown } = await import('./order-module/order.ts')
  assert.equal(typeof mod.Order, 'function', 'order.ts 要 export class Order')
  const Order = mod.Order as new (customer: string, items: { name: string, price: number, qty: number }[]) => OrderLike
  const customer = ['陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬'][Math.floor(Math.random() * 5)]
  const items = [{ name: '美式咖啡', price: 80, qty: 1 + Math.floor(Math.random() * 4) }, { name: '起司蛋糕', price: 120, qty: 1 }]
  const order = new Order(customer, items)
  const total = 80 * items[0].qty + 120
  assert.equal(order.customer, customer, '建構子要把第一個參數存到 this.customer')
  assert.equal(order.total(), total, '建構子要把第二個參數存到 this.items，total() 才算得出來')
  assert.equal(order.summary(), `${customer}：${total} 元（pending）`)
  order.advance(); order.advance(); order.advance()
  assert.equal(order.status, 'picked_up')
  assert.throws(() => order.advance(), Error, '已取餐的訂單再 advance() 要丟錯')
})

test('tsc 檢查 order-module 0 錯誤，OrderStatus 型別是四個字串的聯合', opts, async () => {
  const files = ['main.ts', 'order.ts', 'status.ts', 'types.ts'].map(f => here('order-module/' + f))
  for (const f of files) {
    assert.doesNotMatch(await readFile(f, 'utf8'), /@ts-(ignore|nocheck|expect-error)/,
      `${f.split('/').pop()} 不能用 @ts-ignore、@ts-nocheck、@ts-expect-error 讓 tsc 閉嘴，要把型別改對`)
  }
  const dir = await mkdtemp(here('.typecheck-'))   // 放在練習資料夾裡，tsc 才找得到 @types/node
  try {
    await writeFile(join(dir, 'status-type.ts'), [
      `import type { OrderStatus } from '../order-module/status.ts'`,
      `type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false`,
      `type Expect<T extends true> = T`,
      `export type Check = Expect<Equal<OrderStatus, 'pending' | 'brewing' | 'ready' | 'picked_up'>>`,
    ].join('\n') + '\n')
    const flags = ['--ignoreConfig', '--noEmit', '--strict', '--target', 'esnext', '--module', 'nodenext', '--types', 'node', '--skipLibCheck',
      '--allowImportingTsExtensions', '--erasableSyntaxOnly', '--verbatimModuleSyntax']
    const r = await run(tsc, [...flags, ...files], { cwd: import.meta.dirname, timeoutMs: 12_000 })
    assert.equal(r.code, 0, `tsc 還有錯誤（開了 erasableSyntaxOnly、verbatimModuleSyntax、strict）：\n${r.stdout.trim().split('\n').slice(0, 6).join('\n')}`)
    const t = await run(tsc, [...flags, join(dir, 'status-type.ts')], { cwd: import.meta.dirname, timeoutMs: 12_000 })
    assert.equal(t.code, 0, `OrderStatus 型別要是 'pending' | 'brewing' | 'ready' | 'picked_up'：寫 export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus]，不要用 string 或 any`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
