// 練習 2：每個請求建立一份 context。起始程式把「目前的顧客」存在模組變數裡，兩個請求同時進來就會互相蓋掉
import type { Db, CustomerRow } from './db.ts'

export type Context = {
  db: Db
  viewer: CustomerRow | null
}

// 每個請求呼叫一次：viewer 只屬於這個請求，別的請求看不到、也改不到
let cached: CustomerRow | null | undefined   // ✗ 第一個請求查到的顧客，之後的請求都沿用

export async function createContext(request: Request, db: Db): Promise<Context> {
  const id = request.headers.get('x-customer-id')
  if (cached === undefined) cached = id ? await db.customerById(id) : null
  return { db, viewer: cached }
}
