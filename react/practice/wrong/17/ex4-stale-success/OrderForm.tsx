// 成功訊息用 useState 自己記：之後失敗了，舊的成功訊息還掛著
import { useActionState, useId, useState } from 'react'
import { initialOrderState, type Field, type OrderAction } from './order-types.ts'

const LABELS: Record<Field, string> = { name: '姓名', phone: '手機', quantity: '數量', pickupTime: '取餐時間' }

export function OrderForm({ action }: { action: OrderAction }) {
  const id = useId()
  const [state, formAction, isPending] = useActionState(action, initialOrderState)
  const [lastId, setLastId] = useState<number | null>(null)
  if (state.orderId !== null && state.orderId !== lastId) setLastId(state.orderId)

  return (
    <form action={formAction} noValidate>
      {(Object.keys(LABELS) as Field[]).map(field => {
        const error = state.fieldErrors[field]?.[0]
        const errorId = `${id}-${field}-error`
        return (
          <div key={field}>
            <label htmlFor={`${id}-${field}`}>{LABELS[field]}</label>
            {/* 非受控：失敗時 state.values 是送出的原文，React 重設表單時會放回 defaultValue */}
            <input
              id={`${id}-${field}`}
              name={field}
              defaultValue={state.values[field]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && <p role="alert" id={errorId}>{error}</p>}
          </div>
        )
      })}
      {state.formError && <p role="alert">{state.formError}</p>}
      {lastId !== null && <p role="status">訂單 #{lastId} 已送出</p>}
      <button type="submit" disabled={isPending}>{isPending ? '送出中…' : '送出訂單'}</button>
    </form>
  )
}
