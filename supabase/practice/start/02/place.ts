// 練習 3：新增訂單。單價與總價用資料庫裡的價格算，不信任呼叫的人傳進來的價格
import type { SupabaseClient } from '@supabase/supabase-js'

export type CartItem = { productId: number, quantity: number }

export async function placeOrder(client: SupabaseClient, customerId: number, items: CartItem[]): Promise<number> {
  // 1. 一次查出這些商品的 id 與 price（in 篩選）；有商品查不到就丟出 Error
  // 2. 新增一張訂單（customer_id、total），拿回新訂單的 id
  // 3. 新增每個品項（order_id、product_id、quantity、unit_price）
  // 4. 回傳新訂單的 id；任何一步 API 回錯誤都丟出 Error
  return 0
}
