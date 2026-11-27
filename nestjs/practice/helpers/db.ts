// 清空這一題判分資料庫的所有資料表（留下 _prisma_migrations），id 從 1 重新開始。測試在 beforeEach 呼叫
//   beforeEach(() => resetDb(prisma))
type RawClient = { $executeRawUnsafe(sql: string): Promise<unknown>; $queryRawUnsafe<T>(sql: string): Promise<T> }

export async function resetDb(prisma: RawClient) {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`)
  if (rows.length) await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
}
