// 很慢的商品格（想像每個商品都有大圖、加購選項與庫存，舊平板上 render 一次要上百毫秒）。這個檔案不用改
import type { Product } from '../../helpers/fake-api.ts'

export function ProductGrid({ products, keyword }: { products: readonly Product[]; keyword: string }) {
  const k = keyword.trim()
  const shown = products.filter(p => p.name.includes(k))
  if (shown.length === 0) return <p>沒有符合的商品</p>
  return (
    <ul aria-label="商品格">
      {shown.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}
