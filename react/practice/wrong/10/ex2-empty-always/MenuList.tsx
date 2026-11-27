import type { ReactNode } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export type ItemHelpers = { index: number; add: () => void }

type MenuListProps = {
  products: readonly Product[]
  onAdd: (productId: number) => void
  renderItem?: (product: Product, helpers: ItemHelpers) => ReactNode
  empty?: ReactNode
}

const defaultItem = (product: Product): ReactNode => `${product.name} $${product.price}`

export function MenuList({ products, onAdd, renderItem = defaultItem, empty = '目前沒有商品' }: MenuListProps) {
  return (
    <>
    <p className="empty">{empty}</p>
    <ul>
      {products.map((product, index) => (
        <li key={product.id}>{renderItem(product, { index, add: () => onAdd(product.id) })}</li>
      ))}
    </ul>
    </>
  )
}
