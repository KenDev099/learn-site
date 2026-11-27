import type { SubmitEvent } from 'react'

export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 非受控了，但還是 onSubmit + new FormData(form)：不含按下去的按鈕，topic 是 null
export function NewsletterForm({ subscribe }: Props) {
  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    await subscribe(String(data.get('email')), data.get('topic') as Topic)
  }
  return (
    <form onSubmit={handleSubmit}>
      <label>Email<input type="email" name="email" /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
