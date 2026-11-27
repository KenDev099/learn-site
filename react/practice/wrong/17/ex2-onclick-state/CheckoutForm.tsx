import { useState, type ReactNode } from 'react'

type ButtonProps = { children: ReactNode; pendingText: string }

// 按下去自己記 pending：Action 什麼時候結束它不知道，按鈕永遠卡在送出中
export function SubmitButton({ children, pendingText }: ButtonProps) {
  const [pending, setPending] = useState(false)
  return (
    <button type="submit" disabled={pending} onClick={() => setPending(true)}>
      {pending ? pendingText : children}
    </button>
  )
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
