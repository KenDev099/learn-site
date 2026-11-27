// 練習 3：你寫的 test/orders.int-spec.ts 要抓到每一個改壞的 OrdersService
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

const FILE = 'src/orders/orders.service.ts'
const swap = (from: string | RegExp, to: string) => ({ [FILE]: (code: string) => {
  const changed = code.replace(from, to)
  if (changed === code) throw new Error(`${FILE} 裡找不到「${from}」：這一題只寫測試，不要改 ${FILE}`)
  return changed
} })

const READ_THEN_WRITE = `private async decrementStock(tx: Prisma.TransactionClient, { productId, quantity }: OrderItemInput) {
    const { stock } = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } })
    if (stock < quantity) throw new OutOfStockError(productId, quantity, stock)
    await tx.product.update({ where: { id: productId }, data: { stock: stock - quantity } })
  }
}
`

const PRICE_AT_QUERY_TIME = `findOrder(id: number) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      select: { id: true, customerId: true, items: { select: { productId: true, quantity: true, product: { select: { price: true } } }, orderBy: { id: 'asc' } } },
    }).then(o => {
      const items = o.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.product.price }))
      return { id: o.id, customerId: o.customerId, total: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), items }
    })
  }`

describe('練習 3：OrdersService 的整合測試', () => {
  const spec = join(import.meta.dirname, 'test/orders.int-spec.ts')

  it('每個測試前都清空資料表（beforeEach 呼叫 resetDb）', () => {
    const code = readFileSync(spec, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // resetDb( 要在 beforeEach( 的那個呼叫裡：中間不能跨過別的 hook 或測試
    expect(code, '在 beforeEach 呼叫 resetDb(prisma)：測試不能依賴上一個測試留下的資料，單獨跑、換順序跑都要過').toMatch(/\bbeforeEach\s*\((?:(?!\b(?:beforeAll|afterAll|afterEach|beforeEach|it|test|describe)\s*[.(])[\s\S])*?\bresetDb\s*\(/)
  })

  it('你的測試抓得到每一個改壞的版本', () => {
    const r = runMutants(import.meta.dirname, {
      '沒有交易：第二項失敗時，第一項扣掉的庫存不會還原': swap('this.prisma.$transaction(tx => this.placeOrder(tx, customerId, items))', 'this.placeOrder(this.prisma, customerId, items)'),
      'tx 沒有傳進 helper：扣庫存跑在交易外面': swap('await this.decrementStock(tx, item)', 'await this.decrementStock(this.prisma, item)'),
      '先讀再寫：並發時會賣超': swap(/private async decrementStock[\s\S]*$/, READ_THEN_WRITE),
      '單價在查詢時才從商品讀：商品改價，舊訂單跟著變': swap(/findOrder\(id: number\) \{[\s\S]*?\n  \}/, PRICE_AT_QUERY_TIME),
      '庫存不足時沒有丟錯，照樣建立訂單': swap('if (count === 0) {', 'if (count < 0) {'),
    })
    expect(r.survived, `沒抓到的版本：${r.survived.join('、')}。這些故意改壞的 OrdersService，你的測試都沒有失敗。要用真的資料庫（不要 mock PrismaService），斷言資料庫裡最後的狀態（庫存、訂單數），並發測試要同時送出、全部 await 完再斷言`).toEqual([])
  }, 600_000)
})
