// 菜單的一列。這個檔案不用改
import type { Product } from '../../helpers/fake-api.ts'

export function ProductRow({ product, onAdd }: { product: Product; onAdd: (productId: number) => void }) {
  return (
    <li>
      {product.name} ${product.price}
      <button type="button" aria-label={`加入${product.name}`} onClick={() => onAdd(product.id)}>加入</button>
    </li>
  )
}
