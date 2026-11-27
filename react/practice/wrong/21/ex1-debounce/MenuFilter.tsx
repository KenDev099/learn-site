import { memo, useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ProductGrid } from './ProductGrid.tsx'

const Grid = memo(ProductGrid)

// 錯誤：用 debounce 等使用者停手 300ms 才更新商品格
export function MenuFilter({ products }: { products: readonly Product[] }) {
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(keyword), 300)
    return () => clearTimeout(id)
  }, [keyword])
  return (
    <>
      <label>
        篩選商品
        <input value={keyword} onChange={e => setKeyword(e.target.value)} />
      </label>
      <section aria-label="商品" aria-busy={keyword !== debounced}>
        <Grid products={products} keyword={debounced} />
      </section>
    </>
  )
}
