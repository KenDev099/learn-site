// 很慢的菜單（想像有上百個商品，每個都有圖片、選項與庫存）。這個檔案不用改
import type { Product } from '../../helpers/fake-api.ts'

export function SlowMenu({ products }: { products: readonly Product[] }) {
  return (
    <ul aria-label="菜單">
      {products.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}
