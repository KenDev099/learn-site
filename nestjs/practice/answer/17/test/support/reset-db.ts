import type { PrismaClient } from '../../src/generated/prisma/client.js'

// 清空所有應用程式的資料表（不含 _prisma_migrations），自動編號從 1 重新開始
export async function resetDb(prisma: PrismaClient): Promise<void> {
  // 表名每次從資料庫查：之後新增的資料表自動包含，不用回來改這裡
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  // 表名不能用 $1 參數傳，只能組進字串；名稱來自 pg_tables（不是使用者輸入），加上雙引號
  const list = tables.map(t => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}
