/*
練習 2（下）：頁首的購物車徽章（第 14 課的 selector、第 19 課「先量測誰在 render」）
驗收條件：
  1. 顯示 <p>購物車 {件數} 件</p>，件數用 selectCount
  2. 只訂閱件數：lines 換了新陣列、件數沒變時，CartBadge 不能重新 render
*/
import { useCartStore, selectCount } from './cart-store.ts'

export function CartBadge() {
  // selector 回傳數字：件數沒變，Object.is 判定相同，就不重新 render
  const lines = useCartStore(s => s.lines)
  const count = selectCount({ ...useCartStore.getState(), lines })
  return <p>購物車 {count} 件</p>
}
