// 練習 1：商品卡片 ProductCard（JSX、props、事件處理函式）
// 錯誤寫法：onClick={onAdd(product.id)}：render 時就呼叫，按了反而沒反應
import type { Product } from '../../helpers/fake-api.ts'

type Props = {
  product: Product
  soldOut?: boolean
  onAdd: (productId: number) => void
}

// 解構 props；等號後面是沒傳（undefined）時的預設值
export function ProductCard({ product, soldOut = false, onAdd }: Props) {
  return (
    <article className={soldOut ? 'card sold-out' : 'card'}>
      <h3>{product.name} ${product.price}</h3>
      {soldOut && <span className="badge">售完</span>}
      {/* 傳一個函式給 onClick：按下去才呼叫 onAdd */}
      <button type="button" disabled={soldOut} onClick={onAdd(product.id)}>加入</button>
    </article>
  )
}
