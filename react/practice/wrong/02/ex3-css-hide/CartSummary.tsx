// 練習 3：購物車摘要 CartSummary（條件渲染）
// 錯誤寫法：折扣那一行用 CSS 藏起來，還留在 DOM 裡
type Props = { count: number; total: number; discount?: number }

const FREE_SHIPPING = 500

export function CartSummary({ count, total, discount = 0 }: Props) {
  // 提早 return：後面都不用再管「空的」這個情況
  if (count === 0) return <p>購物車是空的</p>

  return (
    <section aria-label="購物車摘要">
      <p>共 {count} 件</p>
      {/* && 的左邊要是布林值：discount 是 0 時，discount && … 會 render 出 0 */}
      <p hidden={discount === 0}>折扣 -${discount}</p>
      <p>合計 ${total}</p>
      {total >= FREE_SHIPPING ? <p>免運</p> : <p>再買 ${FREE_SHIPPING - total} 免運</p>}
    </section>
  )
}
