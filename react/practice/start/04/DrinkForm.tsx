// 練習 1：飲料客製表單 DrinkForm（受控的各種輸入，一個 state 物件）
// 問題：每個欄位都用 defaultValue／defaultChecked 帶入初始值，之後 React 就不知道使用者改了什麼；
//       下面的摘要是寫死的，「重設」按鈕也沒有作用。
// 要求：
//   1. 用一個 useState 存整份 Draft（初始值是 props 的 initial），五個欄位全部改成受控：
//      商品 <select>、數量 <input type="number">、甜度 radio、外帶 checkbox、備註 <textarea>
//   2. productId 在 state 裡是數字（<select> 給你的是字串）；quantity 在 state 裡保持字串，計算時才轉成數字
//   3. <p role="status"> 的摘要由 state 算出來，格式：
//        拿鐵 × 2，半糖，外帶，共 $220          （沒勾外帶寫「內用」）
//        拿鐵 × 2，半糖，外帶，共 $220，備註：少冰  （備註去掉頭尾空白後不是空的才加）
//      數量不是 1～20 的整數（包含清空）時，整句改成：數量要是 1～20 的整數
//   4. 按「重設」：所有欄位與摘要回到 initial
// 不能做的事：不能修改 initial 或 state 物件本身（測試傳入的 initial 是凍結的）；商品名稱與價格要從 props 的 products 讀，不能寫死
import type { Product } from '../../helpers/fake-api.ts'

export type Sweetness = 'normal' | 'half' | 'none'
export type Draft = { productId: number; quantity: string; sweetness: Sweetness; takeout: boolean; note: string }

export const SWEETNESS: readonly { value: Sweetness; label: string }[] = [
  { value: 'normal', label: '正常甜' },
  { value: 'half', label: '半糖' },
  { value: 'none', label: '無糖' },
]

export function DrinkForm({ products, initial }: { products: readonly Product[]; initial: Draft }) {
  return (
    <form>
      <label>
        商品
        <select name="productId" defaultValue={initial.productId}>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>
        數量
        <input type="number" name="quantity" min={1} max={20} defaultValue={initial.quantity} />
      </label>
      <fieldset>
        <legend>甜度</legend>
        {SWEETNESS.map(s => (
          <label key={s.value}>
            <input type="radio" name="sweetness" value={s.value} defaultChecked={initial.sweetness === s.value} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <label>
        <input type="checkbox" name="takeout" defaultChecked={initial.takeout} />
        外帶
      </label>
      <label>
        備註
        <textarea name="note" defaultValue={initial.note} />
      </label>
      <button type="button">重設</button>
      <p role="status">拿鐵 × 1，正常甜，內用，共 $110</p>
    </form>
  )
}
