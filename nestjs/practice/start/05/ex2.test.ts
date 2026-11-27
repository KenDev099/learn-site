// 練習 2：你寫的 src/orders.service.spec.ts 要用 Testing Module 測 OrdersService.create，抓到每一個改壞的版本
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

function stage(spec: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learn-nest05-'))
  cpSync(import.meta.dirname, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) && (!f.endsWith('.spec.ts') || f.endsWith('/' + spec)) })
  return dir
}

const file = 'src/orders.service.ts'
const REFACTOR = '重構（行為不變，測試要照樣通過）'
const swap = (from: string, to: string) => ({ [file]: (code: string) => {
  if (!code.includes(from)) throw new Error(`src/orders.service.ts 被改過了，找不到「${from}」：這一題只寫測試，不要改 orders.service.ts`)
  return code.replace(from, to)
} })

const check = '    if (product.stock < input.quantity) throw new OutOfStockError(product.name, product.stock)\n'
const total = '    const total = product.price * input.quantity\n'
const save = '    return this.orders.save({ productId: product.id, quantity: input.quantity, total })\n'

describe('練習 2：OrdersService.create 的測試', () => {
  it('你的測試抓得到每一個改壞的版本', () => {
    const dir = stage('orders.service.spec.ts')
    try {
      const r = runMutants(dir, {
        '沒有檢查庫存': swap(check, ''),
        '買剛好等於庫存的數量也被拒絕': swap('product.stock < input.quantity', 'product.stock <= input.quantity'),
        '總額忘了乘數量': swap('product.price * input.quantity', 'product.price'),
        '庫存不足時吞掉錯誤、回傳 null': swap('throw new OutOfStockError(product.name, product.stock)', 'return null as unknown as Order'),
        '先存訂單才檢查庫存': swap(check + total + save, total
          + '    const saved = await this.orders.save({ productId: product.id, quantity: input.quantity, total })\n'
          + check + '    return saved\n'),
        '存進去的數量寫錯': swap('quantity: input.quantity, total', 'quantity: 1, total'),
        '用 import type 匯入 ProductsService（依賴注入會壞）': swap('import { ProductsService }', 'import type { ProductsService }'),
        '庫存不足卻丟成「找不到商品」': swap('throw new OutOfStockError(product.name, product.stock)', 'throw new NotFoundException(`找不到商品 ${input.productId}`)'),
        [REFACTOR]: swap(save, '    const order = { productId: product.id, quantity: input.quantity, total }\n    return this.orders.save(order)\n'),
      })
      expect(r.killed, `只是把 save 的參數先放進變數、行為完全一樣的 OrdersService，你的測試卻失敗了。測試要檢查回傳值、丟出的錯和替身收到什麼，不要比對原始碼`).not.toContain(REFACTOR)
      const missed = r.survived.filter(n => n !== REFACTOR)
      expect(missed, `沒抓到的版本：${missed.join('、')}。這些故意改壞的 OrdersService，你的測試都沒有失敗。錯誤路徑要測（丟出的要是 OutOfStockError，不是隨便一個錯）、要確認 save 收到什麼（或沒被呼叫），而且 OrdersService 要從 Test.createTestingModule 拿，不要自己 new`).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
