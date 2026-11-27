// 練習 2：每個請求建立一份 context。起始程式把「目前的顧客」存在模組變數裡，兩個請求同時進來就會互相蓋掉
import type { Db } from './db.ts'

export type Context = {
  db: Db
}

// ✗ 模組變數：整個程序只有一份，所有請求共用
export let currentCustomerId: string | null = null

export async function createContext(request: Request, db: Db): Promise<Context> {
  currentCustomerId = request.headers.get('x-customer-id')
  return { db }
}

