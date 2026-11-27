import { useState, type SubmitEvent } from 'react'

export type Member = { id: number; name: string; points: number; newsletter: boolean }

export function MemberEditor({ member, onSave }: { member: Member; onSave: (member: Member) => void }) {
  const [name, setName] = useState(member.name)
  const [points, setPoints] = useState(String(member.points))
  const [newsletter, setNewsletter] = useState(member.newsletter)

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)   // 送出的那一刻才向 DOM 要值
    onSave({
      id: member.id,
      name: String(data.get('name')).trim(),
      points: Number(data.get('points')),        // FormData 裡都是字串
      newsletter: data.has('newsletter'),        // 沒勾選的 checkbox 不會出現在 FormData 裡
    })
  }

  // key：defaultValue 只在掛載時生效，換會員時用 key 讓整個表單重建
  return (
    <form key={member.id} onSubmit={handleSubmit}>
      <label>
        姓名
        <input name="name" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label>
        點數
        <input type="number" name="points" min={0} value={points} onChange={e => setPoints(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" name="newsletter" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} />
        訂閱電子報
      </label>
      <button type="submit">儲存</button>
      <button type="reset">還原</button>
    </form>
  )
}
