// 練習 4：顧客備註 CustomerNotes（props 變了要重設 state：用 key）
// 問題：NoteForm 用 effect「customer.id 變了就 setDraft('')」來清空表單。結果：
//       - 換顧客時先用舊的草稿 render 一次（王小明的備註短暫出現在陳美華名下），effect 再清空、再 render 一次
//       - 只清了 draft：後來加的「急件」和非受控的「回電時間」都忘了重設，會帶到下一位顧客
// 要求：
//   1. 換顧客時，NoteForm 裡所有的狀態都要重設：備註、急件、回電時間（非受控欄位，setState 管不到）
//   2. 換顧客只 render 一輪
//   3. 兩位顧客同名（id 不同）也要重設
//   4. 還是同一位顧客時（父元件重新 render、再點一次同一位），已經輸入的內容要留著
// 提示：state 屬於元件在樹上的位置；key 不同，React 就當成另一個元件（第 3 課）。這題只需要改一個地方、刪掉一段。
// 不能做的事：
//   - 不能用 effect 重設 state，也不能在 NoteForm 裡一個一個手動重設
//   - 畫面結構（label 文字、role）不要改
import { useState } from 'react'
import type { Customer } from '../../helpers/fake-api.ts'

export function CustomerNotes({ customers }: { customers: readonly Customer[] }) {
  const [selectedId, setSelectedId] = useState(customers[0].id)
  // 存 id、不存整個物件：選中的顧客每次 render 從清單找出來
  const customer = customers.find(c => c.id === selectedId) ?? customers[0]

  return (
    <section>
      <nav aria-label="顧客">
        {customers.map(c => (
          <button key={c.id} type="button" aria-pressed={c.id === customer.id} onClick={() => setSelectedId(c.id)}>
            {c.name}
          </button>
        ))}
      </nav>
      {/* key 換了，React 卸載舊的 NoteForm、掛載新的：裡面所有 state 與 DOM 都重來 */}
      <NoteForm customer={customer} />
    </section>
  )
}

function NoteForm({ customer }: { customer: Customer }) {
  const [draft, setDraft] = useState('')
  const [urgent, setUrgent] = useState(false)

  return (
    <form>
      <h3>給 {customer.name} 的備註</h3>
      <label>
        備註 <input key={customer.id} value={draft} onChange={e => setDraft(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> 急件
      </label>
      <label>
        回電時間 <input name="callback" defaultValue="" />
      </label>
    </form>
  )
}
