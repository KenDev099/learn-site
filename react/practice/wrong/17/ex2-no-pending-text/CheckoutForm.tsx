import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

type ButtonProps = { children: ReactNode; pendingText: string }

// 有 disabled，但忘了換文字：使用者不知道正在送出
export function SubmitButton({ children }: ButtonProps) {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending}>{children}</button>
}

type Props = { checkout: (formData: FormData) => Promise<void> }

export function CheckoutForm({ checkout }: Props) {
  return (
    <form action={checkout}>
      <label>取餐姓名<input name="name" /></label>
      <SubmitButton pendingText="結帳中…">結帳</SubmitButton>
    </form>
  )
}
