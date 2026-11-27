import test from 'node:test'
import assert from 'node:assert/strict'
import type { EventEmitter } from 'node:events'

const opts = { timeout: 15_000 }
type ShopClass = new (name: string) => EventEmitter & { name: string }

// 讓 setTimeout 永遠不會自己觸發（假時鐘），setImmediate 照常：結果每次都一樣
async function load(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const mod: { Shop?: unknown } = await import('./shop.ts')
  assert.equal(typeof mod.Shop, 'function', 'shop.ts 要 export class Shop')
  return mod.Shop as ShopClass
}
// 排一個 nextTick 再等它：Shop 先排的 nextTick 會先執行；setImmediate 要等 event loop 走到 check phase，來不及
const afterTick = () => new Promise(resolve => process.nextTick(resolve))
const nextLoop = () => new Promise(resolve => setImmediate(resolve))
const randomName = () => ['信義店', '大安店', '中山店', '板橋店'][Math.floor(Math.random() * 4)] + Math.floor(Math.random() * 1000)

test('new 之後立刻掛上的監聽器收得到 open，參數是店名', opts, async t => {
  const Shop = await load(t)
  const name = randomName()
  const got: unknown[] = []
  const shop = new Shop(name)
  shop.on('open', n => got.push(n))
  await afterTick()
  assert.deepEqual(got, [name], 'emit 要延後到建構子和呼叫端這段同步程式跑完之後（不能在建構子裡同步 emit），而且要在 event loop 進入下一個 phase 之前發出：setTimeout、setImmediate 都太晚，想想 process.nextTick')
  assert.equal(shop.name, name, 'name 要照常設定')
})

test('掛兩個監聽器：每個都只收到一次', opts, async t => {
  const Shop = await load(t)
  const name = randomName()
  const a: unknown[] = [], b: unknown[] = []
  const shop = new Shop(name)
  shop.on('open', n => a.push(n))
  shop.on('open', n => b.push(n))
  await nextLoop()
  await nextLoop()
  assert.deepEqual(a, [name], '第一個監聽器要剛好收到一次：open 只發一次，不要每掛一個監聽器就補發')
  assert.deepEqual(b, [name], '第二個監聽器也要剛好收到一次')
})
