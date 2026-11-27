// 練習 1：商品卡片 ProductCard（JSX、props、事件處理函式）
// 問題：這是設計師給的 HTML 直接貼進來的樣板：只會顯示「拿鐵 $110」，按「加入」沒有反應，class 也還是 HTML 的寫法。
// 要求：
//   1. 用 TypeScript 宣告 props：product（Product）、soldOut?（boolean，預設 false）、onAdd（收到商品 id 的函式，必填）
//   2. <h3> 顯示「品名 $價格」，例如「拿鐵 $110」、「可頌 $70」
//   3. 根元素 <article> 的 class 是 card；售完時是 card sold-out
//   4. 按一次「加入」呼叫一次 onAdd(product.id)；render 的時候不能呼叫
//   5. 售完時：按鈕 disabled，並在卡片裡多顯示 <span className="badge">售完</span>；沒售完時不能有這個 span
// 不能做的事：修改 props 或 product 的任何屬性（測試傳入的商品是凍結的，改了會丟 TypeError）；用 any
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
      <button type="button" disabled={soldOut} onClick={() => onAdd(product.id)}>加入</button>
    </article>
  )
}
