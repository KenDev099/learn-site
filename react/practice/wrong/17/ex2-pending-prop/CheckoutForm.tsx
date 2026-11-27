import { useActionState, type ReactNode } from 'react'

type ButtonProps = { children: ReactNode; pendingText: string; pending?: boolean }

// CheckoutForm 自己算 isPending 再用 props 傳進來：CheckoutForm 會動，但 SubmitButton 放進別的表單就沒用了
export function SubmitButton({ children, pendingText, pending = false }: ButtonProps) {
  return <button type="submit" disabled={pending}>{pending ? pendingText : children}</button>
}

type Props = { checkout: (formData: FormData) => Promise<void> }

export function CheckoutForm({ checkout }: Props) {
  const [, formAction, isPending] = useActionState(async (_prev: null, formData: FormData) => {
    await checkout(formData)
    return null
  }, null)
  return (
    <form action={formAction}>
      <label>取餐姓名<input name="name" /></label>
      <SubmitButton pendingText="結帳中…" pending={isPending}>結帳</SubmitButton>
    </form>
  )
}
