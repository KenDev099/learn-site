// 練習 5：訂單備註 NoteEditor（state 改了之後，DOM 更新完才能聚焦）
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type Props = { note: string; onSave: (note: string) => void }

export function NoteEditor({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)

  function startEdit() {
    // flushSync：回來的時候 DOM 已經更新，輸入框已經在畫面上
    flushSync(() => {
      setDraft(note)
      setEditing(true)
    })
    input.current?.focus()
  }
  function finish() {
    onSave(draft)
    flushSync(() => setEditing(false))
    editButton.current?.focus()   // 輸入框消失了：把焦點還給「編輯備註」
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
