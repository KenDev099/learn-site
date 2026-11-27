// 練習 3：購物車摘要 CartSummary（條件渲染）
// 問題：購物車是空的時候，畫面上出現一個孤零零的「0」；沒有折扣時也多一個「0」；不管金額多少都顯示「免運」。
// 要求（每一行是一個 <p>，由上到下）：
//   1. count 是 0：整個元件只顯示 <p>購物車是空的</p>，其他都不顯示
//   2. count 大於 0：
//      <p>共 2 件</p>
//      <p>折扣 -$30</p>          ← discount 大於 0 才有這一行；沒傳或是 0 都不能出現，也不能多出「0」
//      <p>合計 $190</p>
//      <p>免運</p>               ← total 滿 500（含）；不滿時改成 <p>再買 $310 免運</p>（差額 = 500 − total）
//   3. 不顯示的東西不能留在 DOM 裡（不要用 CSS 藏起來）
type Props = { count: number; total: number; discount?: number }

export function CartSummary({ count, total, discount }: Props) {
  return (
    <section aria-label="購物車摘要">
      {count && <p>共 {count} 件</p>}
      {discount && <p>折扣 -${discount}</p>}
      <p>合計 ${total}</p>
      <p>免運</p>
    </section>
  )
}
