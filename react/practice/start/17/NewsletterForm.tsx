/*
練習 1：電子報訂閱：從 onSubmit 改成 <form action>
畫面：一格 Email，兩顆送出按鈕：「訂閱新品通知」（topic = 'new'）和「訂閱優惠通知」（topic = 'sale'）。
問題：
  - 按「訂閱優惠通知」，subscribe 收到的 topic 是 null：new FormData(form) 不會包含按下去的那顆按鈕
  - 輸入框是受控的，每打一個字整個元件重新 render，但這張表單只有送出時才需要值
  - 訂閱成功後 Email 還留在輸入框裡
  - 失敗時 catch 起來什麼都不做，使用者以為訂閱成功
要求：
  1. 改用 <form action={…}>：action 收到 FormData，用 formData.get('email') 和 formData.get('topic') 呼叫
     subscribe(email, topic)，並且 await 它（回傳它的 Promise）。不用 onSubmit、不用 preventDefault
  2. 輸入框改成非受控（拿掉 useState，保留 name="email"）：打字時元件不重新 render
  3. 送出中（subscribe 還沒完成）輸入框保留使用者打的字；成功後輸入框自動清空（不要自己清）
  4. subscribe 失敗時不要 catch：讓錯誤往上丟，外層的 Error Boundary 會顯示錯誤
  5. 在輸入框按 Enter 等於按第一顆按鈕（topic = 'new'），這是瀏覽器的行為，不用自己寫
*/
import { useState, type SubmitEvent } from 'react'

export type Topic = 'new' | 'sale'
type Props = { subscribe: (email: string, topic: Topic) => Promise<void> }

export function NewsletterForm({ subscribe }: Props) {
  const [email, setEmail] = useState('')

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    try {
      await subscribe(email, data.get('topic') as Topic)
    } catch {
      // 失敗就算了
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <button type="submit" name="topic" value="new">訂閱新品通知</button>
      <button type="submit" name="topic" value="sale">訂閱優惠通知</button>
    </form>
  )
}
