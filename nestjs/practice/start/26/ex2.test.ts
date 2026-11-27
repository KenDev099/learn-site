// 練習 2：你寫的 test/architecture.spec.ts 要抓到每一個違反架構規則的版本
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

const prepend = (file: string, line: string) => ({ [file]: (code: string) => `${line}\n${code}` })

// 合法的修改：遵守三條規則的新檔案與改動。架構測試在這個版本上要照樣通過（擋下「數檔案、比對內容」這種快照式的測試）
const LEGIT = '合法的修改（catalog、loyalty 各多一個遵守規則的檔案，orders.service.ts 多一個 export）'

describe('練習 2：架構測試', () => {
  it('你的架構測試抓得到每一個違規的版本，合法的修改照樣通過', () => {
    const r = runMutants(import.meta.dirname, {
      [LEGIT]: {
        'src/catalog/menu.ts': `import { PrismaService } from '../prisma/prisma.service.js'\nimport type { ItemInput } from './pricing.service.js'\n\nexport const menu = (prisma: PrismaService) => prisma.product.findMany()\nexport type MenuLine = ItemInput\n`,
        'src/loyalty/vip.ts': `import { ORDER_PAID } from '../orders/events/order-paid.event.js'\nimport { PrismaService } from '../prisma/prisma.service.js'\n\nexport const VIP_EVENT = ORDER_PAID\nexport const vipCards = (prisma: PrismaService) => prisma.stampCard.findMany({ where: { transactions: { some: {} } } })\n`,
        'src/orders/orders.service.ts': (code: string) => `${code}\nexport const ORDERS_API_VERSION = 2\n`,
      },
      '新加的三個檔案繞成一圈（catalog → orders → prisma → catalog）': {
        'src/catalog/cycle-a.ts': `import { b } from '../orders/cycle-b.js'\nexport const a = () => b\n`,
        'src/orders/cycle-b.ts': `import { c } from '../prisma/cycle-c.js'\nexport const b = () => c\n`,
        'src/prisma/cycle-c.ts': `import { a } from '../catalog/cycle-a.js'\nexport const c = () => a\n`,
      },
      'orders 新加的檔案 import loyalty 的內部檔案': {
        'src/orders/points-preview.ts': `import { LoyaltyService } from '../loyalty/loyalty.service.js'\n\nexport const preview = (loyalty: LoyaltyService, customerId: number) => loyalty.balance(customerId)\n`,
      },
      'orders.service.ts 多了一行 import loyalty': prepend('src/orders/orders.service.ts', `import { LoyaltyModule } from '../loyalty/loyalty.module.js'\nexport const loyaltyModule = LoyaltyModule`),
      'catalog 新加的檔案直接查 prisma.stampCard': {
        'src/catalog/vip.ts': `import { PrismaService } from '../prisma/prisma.service.js'\n\nexport const vipCustomers = (prisma: PrismaService) =>\n  prisma.stampCard.findMany({ select: { customerId: true } })\n`,
      },
      'orders 新加的檔案在交易裡寫 tx.pointTransaction': {
        'src/orders/bonus.ts': `import type { Prisma } from '../generated/prisma/client.js'\n\nexport const bonus = (tx: Prisma.TransactionClient, cardId: number) =>\n  tx.pointTransaction.create({ data: { cardId, points: 1, reason: '加碼' } })\n`,
      },
    })
    expect(r.killed.includes(LEGIT), `你的測試在「${LEGIT}」上失敗了：架構測試要檢查規則本身，不要寫死檔案數量、檔案內容或清單。在 work/26 用 npm test 看是哪一個測試、為什麼失敗`).toBe(false)
    const missed = r.survived.filter(name => name !== LEGIT)
    expect(missed, `沒抓到的版本：${missed.join('、')}。每次都要掃描 src 底下現在所有的 .ts（readdirSync 加 recursive: true），循環要能找出任意長度的環（深度優先搜尋），不要只檢查特定幾個檔案`).toEqual([])
  }, 300_000)
})
