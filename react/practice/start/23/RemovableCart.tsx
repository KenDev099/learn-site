/*
  練習 4 的受測元件（已經寫好，不用改）：可以復原的購物車移除
  規格（你的檢查只能依賴這裡寫的東西；判分時會換成計時器寫法、文字都不同的另一個正確版本）：
  - props：items（{ id, name }[]）、onRemove(id: number)（真的刪除，例如通知伺服器）
  - 名稱為「購物車」的清單（list），每個品項一項，各有一顆名稱為「移除{品名}」的按鈕（例如「移除拿鐵」）
  - 按「移除拿鐵」：拿鐵立刻從清單消失，出現 role="status" 的提示（含品名）和一顆「復原」按鈕；這時還不呼叫 onRemove
  - 按下移除後滿 5 秒（5000ms）：呼叫 onRemove(拿鐵的 id) 一次，提示消失，拿鐵不會回到清單
  - 5 秒內按「復原」：拿鐵回到清單，提示消失，之後不管過多久都不呼叫 onRemove
*/
import { useEffect, useRef, useState } from 'react'

export type CartItem = { id: number; name: string }
export type RemovableCartProps = { items: readonly CartItem[]; onRemove: (id: number) => void }

export function RemovableCart({ items, onRemove }: RemovableCartProps) {
  const [pending, setPending] = useState<CartItem | null>(null)
  const [removed, setRemoved] = useState<number[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])   // 離開頁面時不要留著計時器

  function commit(item: CartItem) {
    setRemoved(r => [...r, item.id])
    onRemove(item.id)
  }

  function remove(item: CartItem) {
    clearTimeout(timer.current)
    if (pending) commit(pending)   // 上一個還在等：直接確定刪除
    setPending(item)
    timer.current = setTimeout(() => {
      setPending(null)
      commit(item)
    }, 5000)
  }

  function undo() {
    clearTimeout(timer.current)
    setPending(null)
  }

  return (
    <section>
      <ul aria-label="購物車" className="cart">
        {items.filter(i => i.id !== pending?.id && !removed.includes(i.id)).map(i => (
          <li key={i.id} className="cart__item">
            <span>{i.name}</span>
            <button type="button" aria-label={`移除${i.name}`} onClick={() => remove(i)}>✕</button>
          </li>
        ))}
      </ul>
      {pending && (
        <p role="status" className="cart__toast">
          已移除{pending.name} <button type="button" onClick={undo}>復原</button>
        </p>
      )}
    </section>
  )
}
