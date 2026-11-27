// 練習 2：商品卡 ProductCard（使用者操作造成的事放事件處理函式）
// 問題：按「加入」只把 added 設成 true，真正的加入購物車與通知寫在 effect 裡。結果：
//       - 連按三次只加入一次（added 已經是 true，state 沒變就不會再跑 effect）
//       - 父元件重新 render、傳進來新的 onAdd／notify 函式，effect 又跑一次：客人沒按，購物車卻多一杯
//       - 換成別的商品時，沒按過的商品也被加入
//       - 記錄瀏覽（logView）跟著被重複呼叫
// 要求：先問「這段程式為什麼要執行」，再決定放哪裡
//   1. logView(product.id)：因為「卡片顯示了這個商品」→ 留在 effect。顯示時記一次；換成別的商品（id 不同）再記一次；
//      同一個商品（id 相同，就算物件是新的）不重複記
//   2. onAdd(product.id) 與 notify(`已加入 ${product.name}`)：因為「客人按了加入」→ 放在按鈕的事件處理函式。
//      按幾次就呼叫幾次；沒按就不能呼叫
//   3. 按「加入」不需要任何 state：這個元件不應該因為按了按鈕而重新 render
// 不能做的事：
//   - 不能漏寫依賴，也不能用註解把 eslint 的檢查關掉（測試會跑 react-hooks/exhaustive-deps）
//   - 不能在 render 過程中直接呼叫 logView／onAdd／notify（render 要是純的）
import { useEffect } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

type Props = {
  product: Product
  /** 把商品加入購物車 */
  onAdd: (productId: number) => void
  /** 在畫面角落顯示通知 */
  notify: (message: string) => void
  /** 記錄「這個商品被看到了」（送到統計服務） */
  logView: (productId: number) => void
}

export function ProductCard({ product, onAdd, notify, logView }: Props) {
  // 因為「卡片顯示了這個商品」才要做：effect。依賴寫 product.id（基本型別），物件換新的也不會重跑
  // 錯：漏了 logView 這個依賴
  useEffect(() => {
    logView(product.id)
  }, [product.id])

  // 因為「客人按了加入」才要做：事件處理函式。不需要 state，也就不會重新 render
  function handleAdd() {
    onAdd(product.id)
    notify(`已加入 ${product.name}`)
  }

  return (
    <article>
      <h3>{product.name} ${product.price}</h3>
      <button type="button" onClick={handleAdd}>加入</button>
    </article>
  )
}
