import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

type ButtonProps = { children: ReactNode; pendingText: string }

export function SubmitButton({ children, pendingText }: ButtonProps) {
  // 讀的是「包住這個元件的 <form>」：所以要寫成 <form> 裡面的子元件
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}

type Props = { checkout: (formData: FormData) => Promise<void> }

export function CheckoutForm({ checkout }: Props) {
  return (
    <form action={checkout}>
      <label>
        取餐姓名
        <input name="name" />
      </label>
      <SubmitButton pendingText="結帳中…">結帳</SubmitButton>
    </form>
  )
}
