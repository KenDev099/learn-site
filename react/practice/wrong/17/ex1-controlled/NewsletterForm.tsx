import { useState } from 'react'

export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 用了 <form action>，但輸入框還是受控：每打一個字都重新 render
export function NewsletterForm({ subscribe }: Props) {
  const [email, setEmail] = useState('')
  async function subscribeAction(formData: FormData) {
    await subscribe(email, formData.get('topic') as Topic)
    setEmail('')
  }
  return (
    <form action={subscribeAction}>
      <label>Email<input type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
