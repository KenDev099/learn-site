// 商品卡片。這個檔案不用改
import type { Product } from '../../helpers/fake-api.ts'

export function ProductCard({ product }: { product: Product }) {
  return <li>{product.name} ${product.price}</li>
}
