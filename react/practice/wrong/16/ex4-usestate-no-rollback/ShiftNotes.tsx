import { startTransition, useOptimistic, useRef, useState, type FormEvent } from 'react'
import type { Note, ShopApi } from './shop-api.ts'

type Props = { api: ShopApi; initialNotes: Note[] }
type Shown = Note & { pending?: boolean }

// 錯在：直接 setNotes 加進確認過的列表：失敗時沒有回復，也看不出哪一筆還在送出
export function ShiftNotes({ api, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const tempId = useRef(0)
  // 沒有進行中的 Action 時就是 notes；有的話是 notes 再加上送出中的那幾筆
  const [shown, addPending] = useOptimistic<Shown[], Shown>(notes, (current, note) => [...current, note])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    setError('')
    const id = --tempId.current   // 暫時的負數 id，當 key 用
    startTransition(async () => {
      setNotes(list => [...list, { id, text: value }])
      try {
        await api.addNote(value)
      } catch {
        setError(`「${value}」沒有送出，請再試一次`)
      }
    })
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
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
