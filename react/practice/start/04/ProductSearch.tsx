// 練習 4：商品搜尋 ProductSearch（中文輸入法的組字）
// 問題：客人用注音打「拿」，組字的過程中輸入框依序是「ㄋ」「ㄋㄚ」「ㄋㄚˊ」「拿」。
//       現在每一次都拿去搜尋，清單一直閃「找不到商品」；選字時按的 Enter 也被當成「選第一筆」。
// 要求：
//   1. 輸入框是受控的，組字中打的每個符號都要照常顯示在輸入框裡
//   2. 清單用「關鍵字」篩選（商品名稱包含關鍵字；關鍵字是空的就顯示全部），沒有符合的顯示 <p>找不到商品</p>
//   3. 組字中（compositionstart 之後、compositionend 之前）關鍵字不更新，清單維持組字前的結果
//   4. 組字結束（compositionend）時，關鍵字更新成輸入框當下的內容
//      注意事件順序：最後一次 input 事件在 compositionend「之前」發生，而且 isComposing 還是 true
//   5. 不是用輸入法打的字（英文、貼上）照常每次輸入都更新關鍵字
//   6. 在輸入框按 Enter：呼叫 onPick(清單的第一筆)；組字中按的 Enter 不算，清單是空的也不呼叫
import { useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'

export function ProductSearch({ products, onPick }: { products: readonly Product[]; onPick: (product: Product) => void }) {
  const [text, setText] = useState('')
  const matched = products.filter(p => p.name.includes(text))

  return (
    <div>
      <label>
        搜尋商品
        <input
          type="search"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matched[0]) onPick(matched[0])
          }}
        />
      </label>
      {matched.length > 0
        ? <ul>{matched.map(p => <li key={p.id}>{p.name}</li>)}</ul>
        : <p>找不到商品</p>}
    </div>
  )
}
