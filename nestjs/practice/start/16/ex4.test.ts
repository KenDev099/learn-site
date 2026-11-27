// 練習 4：依台北日期分組的營收報表（一句 $queryRaw）
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { PrismaClient } = await import('./src/generated/prisma/client.js')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: 'event', level: 'query' }] })
const sql: { query: string; params: string }[] = []
prisma.$on('query', e => { sql.push({ query: e.query, params: e.params }) })

let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001')`)
  // 時間都用 UTC 寫：台北是 UTC+8，UTC 16:00 就是台北的隔天 00:00
  await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at) VALUES
    (1, 50,  '2026-09-30T15:59:59Z'),       -- 台北 9/30 23:59:59：不在範圍內
    (1, 80,  '2026-09-30T16:00:00Z'),       -- 台北 10/1 00:00
    (1, 110, '2026-10-01T15:59:59.999Z'),   -- 台北 10/1 23:59:59.999
    (1, 120, '2026-10-01T16:00:00Z'),       -- 台北 10/2 00:00
    (1, 90,  '2026-10-02T03:00:00Z'),
    (1, 70,  '2026-10-02T05:00:00Z'),
    (1, 110, '2026-10-05T10:00:00Z'),
    (1, 80,  '2026-10-07T15:59:59Z'),       -- 台北 10/7 23:59:59：最後一天也要算
    (1, 300, '2026-10-07T16:00:00Z')        -- 台北 10/8：不在範圍內`)
  sql.length = 0
})

const get = (q: string) => request(app.getHttpServer()).get(`/reports/daily-sales?${q}`)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (d.name === 'generated' ? [] : sourceFiles(join(dir, d.name))) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [])
}

describe('練習 4：每日營收報表', () => {
  it('依台北時間的日期分組，orders、revenue 是數字', async () => {
    const res = await get('from=2026-10-01&to=2026-10-07')
    expect(res.status, `要回 200，實際 ${res.status}：${JSON.stringify(res.body)}。500 的話，常見原因是 COUNT(*)／SUM() 回來是 BigInt，JSON.stringify 不支援：在 SQL 裡 ::int`).toBe(200)
    expect(res.body, '台北的一天是 UTC 前一天 16:00 到當天 16:00。用 ordered_at::date 或在 JavaScript 用 toISOString() 切日期，都是 UTC 的日期；要 ordered_at AT TIME ZONE \'Asia/Taipei\'。依日期排序，沒有訂單的日子不出現').toEqual([
      { day: '2026-10-01', orders: 2, revenue: 190 },
      { day: '2026-10-02', orders: 3, revenue: 280 },
      { day: '2026-10-05', orders: 1, revenue: 110 },
      { day: '2026-10-07', orders: 1, revenue: 80 },
    ])
  })

  it('一句 SQL 在資料庫裡分組，日期用參數傳', async () => {
    await get('from=2026-10-01&to=2026-10-07').expect(200)
    expect(sql.length, `送了 ${sql.length} 句 SQL：報表用一句 $queryRaw 在資料庫裡 GROUP BY，不要把訂單撈回來在 JavaScript 加總。\n${sql.map(s => s.query).join('\n')}`).toBe(1)
    const [{ query, params }] = sql
    expect(query, '那一句要有 GROUP BY').toMatch(/GROUP\s+BY/i)
    expect(query, '日期要變成參數 $1、$2（用 $queryRaw`…${from}…`），不能拼進 SQL 字串').toMatch(/\$1[\s\S]*\$2|\$2[\s\S]*\$1/)
    expect(query, 'SQL 本文裡不能出現日期字面值：那代表你把使用者的輸入拼進了 SQL').not.toContain('2026-10')
    expect(params, '參數裡要有 from 和 to').toContain('2026-10-01')
  })

  it('from／to 不是 YYYY-MM-DD 就回 400，而且根本不送 SQL', async () => {
    for (const q of ["from=2026-10-01' OR '1'='1&to=2026-10-07", 'from=2026-10-01&to=2026/10/07', 'from=2026-02-30&to=2026-03-01', 'from=2026-10-01T00:00:00Z&to=2026-10-07', 'from=2026-10-01']) {
      sql.length = 0
      const res = await get(q.replace(/ /g, '%20'))
      expect(res.status, `${q} 要回 400：在 DailySalesQuery 驗證格式（例如 @Matches(/^\\d{4}-\\d{2}-\\d{2}$/) 擋掉帶時間的寫法，加 @IsISO8601({ strict: true }) 擋掉不存在的日期），實際 ${res.status}`).toBe(400)
      expect(sql.length, `${q} 不應該送出任何 SQL`).toBe(0)
    }
  })

  it('src/ 裡沒有 $queryRawUnsafe／$executeRawUnsafe', () => {
    for (const file of sourceFiles(join(import.meta.dirname, 'src'))) {
      expect(readFileSync(file, 'utf8'), `${file.split('/src/')[1]}：不要用 Unsafe 版本，用 $queryRaw 的 tagged template（\${} 會變成參數）；要動態組條件用 Prisma.sql`).not.toMatch(/\$(query|execute)RawUnsafe/)
    }
  })
})
