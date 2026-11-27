/*
練習 3：移除商品：按鈕的名稱、狀態訊息與焦點
問題：
  購物車的「✕」按鈕，讀螢幕軟體只唸「乘號，按鈕」；按下去之後那一列消失，
  焦點跟著不見（回到 body），鍵盤使用者要從頁首重新 Tab 一遍；移除了什麼也沒有任何提示。
要求：
  1. 每個移除按鈕的名稱是「移除{品名}」，例如「移除拿鐵」；畫面上仍然只顯示 ✕
  2. <p role="status"> 一開始就在畫面上（內容是空的），移除後內容變成「已移除{品名}」。
     狀態區要先存在，讀螢幕軟體才會唸出後來的變化：不要等到有訊息才 render 它
  3. 移除之後焦點移到：下一列的移除按鈕；移除的是最後一列，就移到上一列的；
     購物車空了，就移到 <h2>購物車</h2>（加 tabIndex={-1}），並顯示「購物車是空的」
  4. 數量、清單的結構不用改
*/
import { useRef, useState } from 'react'

export type CartItem = { id: number; name: string; quantity: number }

export function CartList({ initialItems }: { initialItems: CartItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [message, setMessage] = useState('')
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const headingRef = useRef<HTMLHeadingElement>(null)

  function remove(item: CartItem) {
    const index = items.findIndex(i => i.id === item.id)
    const next = items[index + 1] ?? items[index - 1]   // 要移過去的按鈕現在就在畫面上，不用等這次更新
    setItems(items.filter(i => i.id !== item.id))
    setMessage(`已移除${item.name}`)
    if (next) buttons.current.get(next.id)?.focus()
    else headingRef.current?.focus()
  }

  return (
    <section>
      <h2 ref={headingRef} tabIndex={-1}>購物車</h2>
      {items.length === 0 ? (
        <p>購物車是空的</p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              {item.name} × {item.quantity}
              <button
                type="button"
                ref={el => {
                  if (el) buttons.current.set(item.id, el)
                  return () => { buttons.current.delete(item.id) }
                }}
                onClick={() => remove(item)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status">{message}</p>
    </section>
  )
}
