import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function ProductSearch({ products, onPick }: { products: readonly Product[]; onPick: (product: Product) => void }) {
  const [text, setText] = useState('')         // 輸入框裡的字，包含組字中的注音
  const [keyword, setKeyword] = useState('')   // 真的拿去篩選的字，組完字才更新
  const matched = products.filter(p => p.name.includes(keyword))

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value)                    // 受控的輸入框一定要跟著更新，不然組字會被打斷
    // 文字輸入框的 onChange 來自原生的 input 事件，組字中它的 isComposing 是 true
    if (!(e.nativeEvent as InputEvent).isComposing) setKeyword(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 組字中的按鍵：isComposing 是 true；有些瀏覽器在組字的頭尾會漏掉，所以連 keyCode 229 一起檢查（MDN 的建議寫法）
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && matched[0]) onPick(matched[0])
  }

  return (
    <div>
      <label>
        搜尋商品
        <input
          type="search"
          value={text}
          onChange={handleChange}
          onCompositionEnd={e => setKeyword(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      {matched.length > 0
        ? <ul>{matched.map(p => <li key={p.id}>{p.name}</li>)}</ul>
        : <p>找不到商品</p>}
    </div>
  )
}
