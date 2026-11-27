import type { SubmitEvent } from 'react'

export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 帶上 submitter，topic 對了；但 onSubmit + preventDefault 不會在成功後重設表單，錯誤也到不了 Error Boundary
export function NewsletterForm({ subscribe }: Props) {
  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget, e.nativeEvent.submitter)
    try {
      await subscribe(String(data.get('email')), data.get('topic') as Topic)
    } catch {
      // 吞掉
    }
  }
  return (
    <form onSubmit={handleSubmit}>
      <label>Email<input type="email" name="email" /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
