// 練習 3 用的 API（不用改）：瀏覽器呼叫它會再向伺服器要一次菜單
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'

export async function fetchMenu(): Promise<Product[]> {
  return structuredClone(PRODUCTS) as Product[]
}
