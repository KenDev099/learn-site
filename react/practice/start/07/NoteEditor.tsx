// 練習 5：訂單備註 NoteEditor（state 改了之後，DOM 更新完才能聚焦）
// 問題：按「編輯備註」會出現輸入框，但游標不在裡面，客人要再點一次才能打字；
//       按「完成」之後輸入框消失，焦點掉回 <body>，用鍵盤操作的人要從頁面最上面重新 Tab。
//       原因：setEditing(true) 只是排了一次更新，下一行執行時輸入框還不在 DOM 裡，input.current 是 null。
// 要求：
//   1. 一開始不搶焦點（頁面剛載入時焦點不能跑到「編輯備註」按鈕上）
//   2. 按「編輯備註」：輸入框出現、內容是目前的備註、而且已經取得焦點（可以直接打字）
//   3. 按「完成」：呼叫 onSave(輸入的內容)，回到顯示模式，焦點回到「編輯備註」按鈕
//   4. 聚焦要在按下去的那一輪就完成：不能用 setTimeout 等一下再聚焦
// 不能做的事：在 render 過程中讀寫 ref.current；用註解關掉 lint 規則
import { useRef, useState } from 'react'

type Props = { note: string; onSave: (note: string) => void }

export function NoteEditor({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(note)
    setEditing(true)
    input.current?.focus()   // ✗ 這時輸入框還沒出現在 DOM 裡
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
      <button type="button" onClick={startEdit}>編輯備註</button>
    </p>
  )
}
