/*
練習 4：外帶訂單表單：useActionState 顯示錯誤、保留輸入
畫面：姓名、手機、數量、取餐時間四格和「送出訂單」按鈕。props 的 action 是練習 3 那種 Action
      (prev, formData) => Promise<新的 state>，測試會傳入自己控制的版本（不需要先做完練習 3）。
問題：現在用 onSubmit 自己呼叫 action，結果沒有存起來：錯誤不會顯示、送出中按鈕還能按、成功後欄位也沒清空。
要求：
  1. 用 useActionState(action, initialOrderState)，把它回傳的函式交給 <form action>
  2. 四個欄位保持非受控（打字時元件不重新 render），name 分別是 name、phone、quantity、pickupTime；
     defaultValue 用 state.values 裡的值：失敗時 state.values 是這次送出的原文 → React 重設表單時會放回去；
     成功時是空字串 → 欄位清空
  3. 欄位有錯（state.fieldErrors[欄位] 有訊息）：在欄位下面顯示 <p role="alert">第一個訊息</p>，
     輸入框加 aria-invalid="true" 和 aria-describedby（指向那個 <p> 的 id，id 用 useId 產生）；沒有錯時兩個屬性都不要有
  4. state.formError 有值時顯示 <p role="alert">{formError}</p>
  5. 成功（state.orderId 有值）時顯示 <p role="status">訂單 #{orderId} 已送出</p>
  6. 送出中（isPending）：按鈕 disabled，文字是「送出中…」；這段時間按 Enter 也不會再送出
*/
import { useId, useState, type SubmitEvent } from 'react'
import { initialOrderState, type Field, type OrderAction } from './order-types.ts'

const LABELS: Record<Field, string> = { name: '姓名', phone: '手機', quantity: '數量', pickupTime: '取餐時間' }

export function OrderForm({ action }: { action: OrderAction }) {
  const id = useId()
  const [state] = useState(initialOrderState)

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    await action(state, new FormData(e.currentTarget))
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(Object.keys(LABELS) as Field[]).map(field => (
        <div key={field}>
          <label htmlFor={`${id}-${field}`}>{LABELS[field]}</label>
          <input id={`${id}-${field}`} name={field} />
        </div>
      ))}
      <button type="submit">送出訂單</button>
    </form>
  )
}
