// 錯誤寫法：按「完成」時 setEditing(false) 之後直接 focus。這時按鈕還沒回到 DOM，editButton.current 是 null
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type Props = { note: string; onSave: (note: string) => void }

export function NoteEditor({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)

  function startEdit() {
    flushSync(() => {
      setDraft(note)
      setEditing(true)
    })
    input.current?.focus()
  }
  function finish() {
    onSave(draft)
    setEditing(false)
    editButton.current?.focus()
  }

  if (editing) {
    return (
      <div>
        <input ref={input} aria-label="備註" value={draft} onChange={e => setDraft(e.target.value)} />
        <button type="button" onClick={finish}>完成</button>
      </div>
    )
  }
  return (
    <p>
      備註：{note || '（無）'}{' '}
      <button ref={editButton} type="button" onClick={startEdit}>編輯備註</button>
    </p>
  )
}
