// 用 use() 讀搜尋結果，還沒回來時暫停，交給外面的 Suspense。這個檔案不用改
import { use } from 'react'
import type { SearchCache } from './search-cache.ts'

export function SearchResults({ cache, keyword }: { cache: SearchCache; keyword: string }) {
  const products = use(cache.read(keyword))
  if (products.length === 0) return <p>沒有符合「{keyword}」的商品</p>
  return (
    <ul aria-label="搜尋結果">
      {products.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}
