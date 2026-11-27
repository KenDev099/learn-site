export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

export function NewsletterForm({ subscribe }: Props) {
  async function subscribeAction(formData: FormData) {
    // 成功（沒有丟錯）後 React 會重設非受控欄位；丟錯則交給 Error Boundary
    await subscribe(String(formData.get('email')), formData.get('topic') as Topic)
  }

  return (
    <form action={subscribeAction}>
      <label>
        Email
        <input type="email" name="email" />
      </label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
