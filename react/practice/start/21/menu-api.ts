// 依分類抓菜單的假 API：每次呼叫都等著，由測試用 api.calls[i].resolve() / reject() 決定何時完成。這個檔案不用改
import { deferred } from '../../helpers/deferred.ts'
import { PRODUCTS, type Category, type Product } from '../../helpers/fake-api.ts'

export type CategoryCall = {
  category: Category
  /** 不給 items 就回傳這個分類的商品 */
  resolve: (items?: Product[]) => void
  reject: (reason?: unknown) => void
}

export function createCategoryApi() {
  const calls: CategoryCall[] = []
  return {
    calls,
    getCategory(category: Category): Promise<Product[]> {
      const d = deferred<Product[]>()
      calls.push({
        category,
        resolve: items => d.resolve(items ?? PRODUCTS.filter(p => p.category === category).map(p => ({ ...p }))),
        reject: d.reject,
      })
      return d.promise
    },
  }
}
export type CategoryApi = ReturnType<typeof createCategoryApi>
