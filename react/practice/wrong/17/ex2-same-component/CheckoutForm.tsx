import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

type ButtonProps = { children: ReactNode; pendingText: string; pending?: boolean }

export function SubmitButton({ children, pendingText, pending = false }: ButtonProps) {
  return <button type="submit" disabled={pending}>{pending ? pendingText : children}</button>
}

type Props = { checkout: (formData: FormData) => Promise<void> }

// 在 render <form> 的同一個元件呼叫 useFormStatus：讀不到自己的 form，pending 永遠是 false
export function CheckoutForm({ checkout }: Props) {
  const { pending } = useFormStatus()
  return (
    <form action={checkout}>
      <label>取餐姓名<input name="name" /></label>
      <SubmitButton pendingText="結帳中…" pending={pending}>結帳</SubmitButton>
    </form>
  )
}
