// 錯誤寫法：只處理進入編輯時的焦點。按「完成」後輸入框被移除，焦點掉回 <body>
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
