import { useRef } from 'react'

export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 自己在 await 之前清空：送出中使用者就看不到自己打了什麼，失敗時也拿不回來
export function NewsletterForm({ subscribe }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  async function subscribeAction(formData: FormData) {
    formRef.current?.reset()
    await subscribe(String(formData.get('email')), formData.get('topic') as Topic)
  }
  return (
    <form ref={formRef} action={subscribeAction}>
      <label>Email<input type="email" name="email" /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
