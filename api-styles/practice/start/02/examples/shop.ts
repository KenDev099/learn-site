// 範例共用的 schema 與資料：菜單、訂單、品項。rootValue 的入口函式每被呼叫一次，calls.count 加一
import { buildSchema } from 'graphql'
import { menu } from '../data.ts'

export const schema = buildSchema(`
  enum Category {
    COFFEE
    TEA
    FOOD
  }

  type Product {
    id: ID!
    name: String!
    price: Int!
    category: Category!
    description: String
  }

  type OrderItem {
    product: Product!
    quantity: Int!
  }

  type Order {
    id: ID!
    customerName: String!
    total: Int!
    items: [OrderItem!]!
  }

  input MenuFilter {
    category: Category
    maxPrice: Int
  }

  type Query {
    menu(category: Category): [Product!]!
    product(id: ID!): Product
    search(filter: MenuFilter!): [Product!]!
    order(id: ID!): Order
  }
`)

const orders = [
  { id: '1', customerName: '王小明', total: 190, items: [{ product: menu[0], quantity: 1 }, { product: menu[1], quantity: 1 }] },
  { id: '2', customerName: '陳美華', total: 220, items: [{ product: menu[1], quantity: 2 }] },
]

export const calls = { count: 0 }
type Filter = { category?: string | null, maxPrice?: number | null }

export const rootValue = {
  menu: ({ category }: { category?: string | null }) => {
    calls.count++
    return category ? menu.filter(p => p.category === category) : menu
  },
  product: ({ id }: { id: string }) => {
    calls.count++
    return menu.find(p => p.id === id) ?? null
  },
  search: ({ filter }: { filter: Filter }) => {
    calls.count++
    return menu.filter(p => (!filter.category || p.category === filter.category) && (filter.maxPrice == null || p.price <= filter.maxPrice))
  },
  order: ({ id }: { id: string }) => {
    calls.count++
    return orders.find(o => o.id === id) ?? null
  },
}
