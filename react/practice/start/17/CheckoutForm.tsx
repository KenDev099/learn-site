/*
練習 2：結帳按鈕：useFormStatus
畫面：取餐姓名一格，下面一顆「結帳」按鈕；checkout 是 <form action> 的 Action。
問題：CheckoutForm 在「自己 render <form> 的元件」裡呼叫 useFormStatus，pending 永遠是 false：
      結帳中按鈕不會 disabled，客人連按就送出好幾次。
要求：
  1. 完成 SubmitButton：用 useFormStatus() 讀「包住它的那個 <form>」的狀態
     - 送出中：disabled，文字換成 pendingText
     - 沒在送出：可以按，文字是 children
  2. CheckoutForm 改用 <SubmitButton pendingText="結帳中…">結帳</SubmitButton>，拿掉自己呼叫的 useFormStatus
  3. SubmitButton 要能放進任何一張用 <form action> 的表單：不要用 props 傳 pending 進來，
     也不要自己用 onClick + useState 記錄（Action 什麼時候結束只有 React 知道）
  4. 同一頁有兩張表單時，只有正在送出的那一張的按鈕會變成送出中
*/
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

type ButtonProps = { children: ReactNode; pendingText: string }

export function SubmitButton({ children }: ButtonProps) {
  return <button type="submit">{children}</button>
}

type Props = { checkout: (formData: FormData) => Promise<void> }

export function CheckoutForm({ checkout }: Props) {
  const { pending } = useFormStatus()
  return (
    <form action={checkout}>
      <label>
        取餐姓名
        <input name="name" />
      </label>
      <button type="submit" disabled={pending}>{pending ? '結帳中…' : '結帳'}</button>
    </form>
  )
}
