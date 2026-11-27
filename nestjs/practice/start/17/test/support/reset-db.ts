import type { PrismaClient } from '../../src/generated/prisma/client.js'

// 練習 1：清空所有應用程式的資料表（不含 _prisma_migrations），自動編號從 1 重新開始
// 之後新增的資料表也要自動包含，不要寫死表名
export async function resetDb(prisma: PrismaClient): Promise<void> {
  throw new Error('練習 1：還沒寫 resetDb')
}
