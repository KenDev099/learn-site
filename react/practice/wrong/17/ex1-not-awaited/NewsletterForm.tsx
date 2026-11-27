export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 沒有 await：Action 立刻「成功」結束，表單馬上被清空，失敗也沒人接
export function NewsletterForm({ subscribe }: Props) {
  function subscribeAction(formData: FormData) {
    void subscribe(String(formData.get('email')), formData.get('topic') as Topic).catch(() => {})
  }
  return (
    <form action={subscribeAction}>
      <label>Email<input type="email" name="email" /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
