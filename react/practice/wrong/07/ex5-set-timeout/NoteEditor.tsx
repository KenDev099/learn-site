// 錯誤寫法：用 setTimeout 等 DOM 更新。只是猜時間，按下去的那一輪焦點還沒移過去
import { useRef, useState } from 'react'

type Props = { note: string; onSave: (note: string) => void }

export function NoteEditor({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)

  function startEdit() {
    setDraft(note)
    setEditing(true)
    setTimeout(() => input.current?.focus())
  }
  function finish() {
    onSave(draft)
    setEditing(false)
    setTimeout(() => editButton.current?.focus())
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
