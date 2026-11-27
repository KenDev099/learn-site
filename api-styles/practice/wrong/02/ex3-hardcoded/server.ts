import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Category, Product } from './data.ts'

const menu: Product[] = [
  { id: '1', name: '美式咖啡', price: 80, category: 'COFFEE', description: '每天現烘的中焙豆' },
  { id: '2', name: '拿鐵', price: 110, category: 'COFFEE', description: '濃縮咖啡加鮮奶' },
  { id: '3', name: '卡布奇諾', price: 110, category: 'COFFEE', description: null },
  { id: '4', name: '伯爵紅茶', price: 90, category: 'TEA', description: '佛手柑香氣的紅茶' },
  { id: '5', name: '可頌', price: 70, category: 'FOOD', description: null },
  { id: '6', name: '起司蛋糕', price: 120, category: 'FOOD', description: '重乳酪' },
]

// schema 在程式啟動時建一次，不是每個請求都建
export const schema = createSchema({
  typeDefs: readFileSync(new URL('./menu.graphql', import.meta.url), 'utf8'),
  resolvers: {
    Query: {
      menu: (_parent: unknown, args: { category?: Category | null }) =>
        args.category ? menu.filter(p => p.category === args.category) : menu,
      product: (_parent: unknown, args: { id: string }) => menu.find(p => p.id === args.id) ?? null,
    },
  },
})

export const yoga = createYoga({ schema })
