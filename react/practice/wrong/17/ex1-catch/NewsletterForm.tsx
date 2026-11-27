export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

// 失敗時 catch 起來吞掉：Action「成功」結束，表單被清空，使用者以為訂閱好了
export function NewsletterForm({ subscribe }: Props) {
  async function subscribeAction(formData: FormData) {
    try {
      await subscribe(String(formData.get('email')), formData.get('topic') as Topic)
    } catch {
      // 吞掉
    }
  }
  return (
    <form action={subscribeAction}>
      <label>Email<input type="email" name="email" /></label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
