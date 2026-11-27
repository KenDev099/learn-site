// 錯誤寫法：用 node 直接跑 TypeScript 種子資料。產生的 Client 裡的 import 寫 .js，node 的型別擦除找不到對應的 .ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const coffee = await prisma.category.upsert({ where: { name: '咖啡' }, update: {}, create: { name: '咖啡' } })
await prisma.product.upsert({ where: { name: '美式咖啡' }, update: {}, create: { name: '美式咖啡', price: 80, categoryId: coffee.id } })
await prisma.$disconnect()
