// 結帳頁（已經寫好，不用改）：練習 3 只改 checkout-action.ts
// 第 17 課的寫法：useActionState 接 Action、欄位非受控、defaultValue 接 state 裡的原文、SubmitButton 讀 useFormStatus
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useNavigate } from 'react-router'
import { useCartStore, selectSubtotal } from '../cart/index.ts'
import type { Reporter, ShopApi } from '../../shared/api.ts'
import { createCheckoutAction, initialCheckoutState, type CheckoutValues } from './checkout-action.ts'

type Props = { api: Pick<ShopApi, 'createOrder'>; reporter: Reporter; newKey: () => string }

function SubmitButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{pending ? '送出中…' : '送出訂單'}</button>
}

const LABELS: Record<keyof CheckoutValues, string> = { name: '取餐姓名', phone: '手機', pickupTime: '取餐時間' }

export function CheckoutPage({ api, reporter, newKey }: Props) {
  const id = useId()
  const navigate = useNavigate()
  const subtotal = useCartStore(selectSubtotal)
  // Action 只建立一次：冪等鍵存在它的閉包裡，要跨過好幾次 render
  const [action] = useState(() => createCheckoutAction({
    api, reporter, newKey,
    cart: { lines: () => useCartStore.getState().lines, clear: () => useCartStore.getState().clear() },
    onPlaced: orderId => navigate(`/orders/${orderId}`),
  }))
  const [state, formAction] = useActionState(action, initialCheckoutState)

  return (
    <form action={formAction}>
      <h1>結帳</h1>
      <p>小計 ${subtotal}</p>
      {(Object.keys(LABELS) as (keyof CheckoutValues)[]).map(field => {
        const error = state.fieldErrors[field]?.[0]
        return (
          <div key={field}>
            <label htmlFor={`${id}-${field}`}>{LABELS[field]}</label>
            <input
              id={`${id}-${field}`}
              name={field}
              defaultValue={state.values[field]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-${field}-error` : undefined}
            />
            {error && <p role="alert" id={`${id}-${field}-error`}>{error}</p>}
          </div>
        )
      })}
      {state.formError && <p role="alert">{state.formError}</p>}
      <SubmitButton />
    </form>
  )
}
