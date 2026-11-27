// 練習 4：菜單列表 MenuList（map、key、篩選、空狀態）
// 錯誤寫法：沒寫 key
import type { Category, Product } from '../../helpers/fake-api.ts'

type Props = { products: readonly Product[]; category?: Category; onAdd: (productId: number) => void }

export function MenuList({ products, category, onAdd }: Props) {
  // filter 回傳新陣列，不會動到 props
  const visible = category ? products.filter(p => p.category === category) : products
  if (visible.length === 0) return <p>目前沒有商品</p>

  return (
    <ul>
      {visible.map(p => (
        <li>
          <span>{p.name}</span> <span>${p.price}</span>
          <input aria-label={`${p.name} 的備註`} />
          <button type="button" onClick={() => onAdd(p.id)}>加入{p.name}</button>
        </li>
      ))}
    </ul>
  )
}
