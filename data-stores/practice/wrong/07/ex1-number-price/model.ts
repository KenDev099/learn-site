// 練習 1：門市活動頁的文件模型
// 輸入是後台表單送來的資料（StoreInput），toDocument 把它轉成要存進 stores 集合的文件（StoreDoc）
// - 地址、營業時間：跟門市一起讀，內嵌在同一份文件
// - 推薦商品：商品的正式資料在 PostgreSQL，這裡只存 productId 與「放上活動頁當下」的品名、價格快照
// - 金額用 Decimal128，日期用 Date
import { Decimal128 } from 'mongodb'

export type ProductInput = {
  id: number
  name: string
  price: string          // PostgreSQL numeric 經 pg 讀出來是字串，例如 '110'
  stock: number
  description: string
}

export type StoreInput = {
  name: string
  city: string
  addressLine: string
  hours: { day: number; open: string; close: string }[]   // day：0（週日）～6
  featured: ProductInput[]
  promoEndsAt: string    // 表單送來的 ISO 字串，例如 '2026-12-31T15:59:59.000Z'
}

export type StoreDoc = {
  name: string
  address: { city: string; line: string }
  hours: { day: number; open: string; close: string }[]
  featured: { productId: number; name: string; price: Decimal128 }[]
  promoEndsAt: Date
}

export function toDocument(input: StoreInput): StoreDoc {
  return {
    name: input.name,
    address: { city: input.city, line: input.addressLine },
    hours: input.hours,
    featured: input.featured.map(p => ({ productId: p.id, name: p.name, price: Number(p.price) as unknown as Decimal128 })),
    promoEndsAt: new Date(input.promoEndsAt),
  }
}
