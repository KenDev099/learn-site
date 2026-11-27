// 練習 4：菜單列表 MenuList（map、key、篩選、空狀態）
// 問題：現在只有寫死的一列「拿鐵」。
// 要求：
//   1. products 的每個商品 render 一個 <li>，順序跟陣列一樣；每一列的結構照下面寫死的那一列（名稱、價格、備註輸入框、加入按鈕）
//   2. 有傳 category 時只顯示那個分類的商品
//   3. 每個 <li> 要有 key，用商品 id：測試會刪掉、對調商品，客人在備註框打的字要跟著那個商品走；
//      也會傳入兩個同名但 id 不同的商品
//   4. 按「加入拿鐵」呼叫 onAdd(那個商品的 id)
//   5. 要顯示的商品是 0 個時（陣列是空的，或篩選後沒有），只顯示 <p>目前沒有商品</p>，不能有 <ul>
// 不能做的事：修改 products（它是凍結的）；備註輸入框不用接 value，瀏覽器會自己記住打的字
import type { Category, Product } from '../../helpers/fake-api.ts'

type Props = { products: readonly Product[]; category?: Category; onAdd: (productId: number) => void }

export function MenuList({ products, category, onAdd }: Props) {
  return (
    <ul>
      <li>
        <span>拿鐵</span> <span>$110</span>
        <input aria-label="拿鐵 的備註" />
        <button type="button">加入拿鐵</button>
      </li>
    </ul>
  )
}
