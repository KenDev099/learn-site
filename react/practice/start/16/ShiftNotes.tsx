/*
練習 4：交班備註：React 19 的 useOptimistic
畫面：店員輸入交班備註（「燕麥奶剩兩瓶」），送出後加到列表最後面。這題沒有用 TanStack Query，
      notes 是元件自己的 state，只放伺服器確認過的備註。
問題：現在要等伺服器回應才出現在列表上；失敗時什麼都沒顯示，備註就這樣不見了。
要求：
  1. 用 useOptimistic(notes, reducer) 算出要顯示的列表：送出後立刻出現在最後面，後面加上「（送出中）」
     （列表的每一列：備註文字，送出中的再加「（送出中）」）
  2. 樂觀的那一筆要在 Action 裡加：startTransition(async () => { 加樂觀的那一筆; await api.addNote(…); … })
     在 Action 外面呼叫 useOptimistic 的 set 函式，React 會警告，樂觀的值也不會照預期消失
  3. 成功後把伺服器回傳的備註加進 notes：await 之後的 setNotes 要再包一層 startTransition，
     不然 Action 還沒結束時，畫面會同時出現「確認過的」和「送出中的」同一筆
  4. 失敗時：送出中的那一筆自動消失（Action 結束，useOptimistic 回到 notes），
     顯示 <p role="alert">「備註文字」沒有送出，請再試一次</p>；下一次送出時清掉這個訊息
  5. 送出後輸入框清空；只有空白時不送出
*/
import { useState, type FormEvent } from 'react'
import type { Note, ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; initialNotes: Note[] }
type Shown = Note & { pending?: boolean }

export function ShiftNotes({ api, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const shown: Shown[] = notes

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    try {
      const saved = await api.addNote(value)
      setNotes(list => [...list, saved])
    } catch {
      // TODO：失敗時要告訴店員
    }
  }

  return (
    <section>
      <form onSubmit={handleSubmit}>
        <label>
          交班備註
          <input value={text} onChange={e => setText(e.target.value)} />
        </label>
        <button type="submit">送出</button>
      </form>
      <ul aria-label="備註">
        {shown.map(n => <li key={n.id}>{n.text}{n.pending && '（送出中）'}</li>)}
      </ul>
    </section>
  )
}
