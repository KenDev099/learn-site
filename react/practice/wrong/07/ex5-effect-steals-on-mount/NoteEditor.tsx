// 錯誤寫法：用 effect 依 editing 聚焦，卻沒區分第一次 render。頁面一載入焦點就被搶到「編輯備註」按鈕
import { useEffect, useRef, useState } from 'react'

type Props = { note: string; onSave: (note: string) => void }

export function NoteEditor({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (editing) input.current?.focus()
    else editButton.current?.focus()
  }, [editing])

  function startEdit() {
    setDraft(note)
    setEditing(true)
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
