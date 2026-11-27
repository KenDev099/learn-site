// 練習 2：MenuList（render prop）
// 問題：MenuList 把每一列的長相寫死成「品名」。菜單頁要「品名＋加入按鈕」、後台要「品名＋備註欄」，
//       每多一種長相就得在這裡多加一個 prop。
// 要求：
//   1. 多收一個 renderItem?: (product, helpers) => ReactNode。有傳時，每個 <li> 的內容就是它回傳的東西；
//      helpers 是 { index, add }：index 是第幾列（從 0 開始），add() 會呼叫 onAdd(這一列商品的 id)
//   2. 沒傳 renderItem 時，每一列顯示「品名 $價格」，例如「拿鐵 $110」
//   3. <ul>、<li> 與 key 由 MenuList 負責（key 用 product.id）；renderItem 只管 <li> 裡面
//   4. products 是空陣列時不 render <ul>，改成 <p className="empty">，內容是 empty 這個 prop（ReactNode）；
//      沒傳 empty 時顯示「目前沒有商品」
// 不能做的事：修改 products（測試傳進來的是凍結的陣列）
import type { ReactNode } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export type ItemHelpers = { index: number; add: () => void }

type MenuListProps = {
  products: readonly Product[]
  onAdd: (productId: number) => void
}

export function MenuList({ products }: MenuListProps) {
  return (
    <ul>
      {products.map(product => (
        <li key={product.id}>{product.name}</li>
      ))}
    </ul>
  )
}
