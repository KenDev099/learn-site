import type { PrismaClient } from '../../src/generated/prisma/client.js'

export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  // 先刪子表再刪父表，但編號不會重設
  for (const t of ['order_items', 'orders', 'products', 'categories', 'customers', ...tables.map(t => t.tablename)]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`)
}
