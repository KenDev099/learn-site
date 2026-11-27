// 每個 GraphQL 請求的 context（不用改）：app.ts 每收到一個請求就建立一份
import type { Client } from '@connectrpc/connect'
import type { Db } from '../../../helpers/db.ts'
import type { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'
import type { Loaders } from './loaders.ts'

export type Role = 'CUSTOMER' | 'STAFF'
// 目前登入的人：伺服器用 token 查 session 得到的，客戶端不能自己宣告角色。顧客的 id 就是 customers.id
export type Viewer = { id: string, role: Role }
export type Logger = { error(err: unknown): void }

export type Context = {
  db: Db
  loaders: Loaders                                  // 這個請求專用的 DataLoader
  viewer: Viewer | null
  inventory: Client<typeof InventoryService>        // 庫存服務的 gRPC client
  deadline: number                                  // 這個請求必須在這個時間點（毫秒）之前回應 = 收到請求時的 now() + budgetMs
  now: () => number                                 // 現在幾毫秒；測試會換成假的時鐘，算剩餘時間一律用它
  logger: Logger
}

// 資料庫的列（PGlite 回傳的形狀：id 是數字、時間是 Date）
export type ProductRow = { id: number, name: string, price: number, category: string }
export type CustomerRow = { id: number, name: string, email: string | null }
export type OrderRow = { id: number, customer_id: number, ordered_at: Date, total: number, internal_note: string | null }
export type ItemRow = { order_id: number, product_id: number, quantity: number, unit_price: number }
