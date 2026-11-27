// 練習 1：確認對話框 ConfirmDialog（Portal、焦點、Esc）
// 問題：訂單列表每一列都有「刪除訂單」的確認對話框。現在它直接畫在 <li> 裡面：
//   會被列表的 overflow 裁掉、打開後鍵盤焦點還留在後面的列表、按 Esc 也關不掉。
// 要求：
//   1. open 為 false 時什麼都不畫；為 true 時用 createPortal 畫到 document.body 底下
//   2. 對話框元素有 role="dialog"、aria-modal="true"，aria-labelledby 指向顯示 title 的 <h2>；
//      同一頁有兩個對話框時 id 不能重複
//   3. 開啟後焦點移到「確定」；關閉後（取消、確定、Esc 都算）焦點回到開啟前有焦點的元素
//   4. 焦點在對話框裡時按 Esc 呼叫 onClose；對話框沒開的時候按 Esc 不能呼叫
//   5. 「取消」呼叫 onClose，「確定」呼叫 onConfirm（要不要關閉由父元件決定，這裡不用管）
//   6. 在對話框裡點擊，不能觸發 React 樹上祖先的 onClick（測試把對話框放在有 onClick 的 <li> 裡）
//   7. 對話框開著時父元件重新 render（例如使用者在對話框裡的輸入框打字），焦點不能被搶走
// 不能做的事：在 render 的過程中呼叫 focus() 或註冊監聽（副作用放 effect 或事件處理函式）
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  children?: ReactNode
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, children, onConfirm, onClose }: Props) {
  if (!open) return null
  return (
    <div className="dialog">
      <h2>{title}</h2>
      {children}
      <button type="button" onClick={onClose}>取消</button>
      <button type="button" onClick={onConfirm}>確定</button>
    </div>
  )
}
