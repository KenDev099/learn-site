import type { PrismaClient } from '../../src/generated/prisma/client.js'

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE categories, products, customers, orders, order_items RESTART IDENTITY CASCADE')
}
