// 錯誤寫法：拿掉 memo 讓畫面看起來對，排序也修好了，但購物車還是直接改 state
// 問題：沒開 Compiler 的時候看起來大致正常，但它偷改了兩樣不屬於它的東西：
//       1. menu.sort() 直接把父元件傳進來的菜單陣列排好（改到 props）
//       2. 同一個品項 hit.qty += 1、新品項 lines.push()，再複製外層陣列交給 setLines（改到 state）
//       CartLine 用 memo 包起來，模擬開了 React Compiler 之後的自動記憶化：line 物件沒換，它就沿用上次的畫面，
//       所以第二次加拿鐵，畫面還停在「拿鐵 × 1」。
// 要求：
//   1. 菜單依價格由低到高顯示，價格相同的維持原本順序；父元件傳進來的 menu（陣列和裡面的物件）都不能被改
//   2. 按「加入X」：購物車沒有 X 就新增一列「X × 1」，有就把那一列的數量加 1
//   3. 每次加入後呼叫 onCartChange(新的購物車陣列)；之前交出去的購物車之後不能再被改
//   4. 沒變的那幾列沿用原本的物件（CartLine 的 memo 才跳得過），只有數量變了的那一列換成新物件
//   5. 不能拿掉 CartLine 的 memo
// 不能做的事：改 menu、改 lines 或裡面的物件；用註解關掉 lint 規則
import { useState } from 'react'

export type Product = { id: number; name: string; price: number }
export type Line = { id: number; name: string; qty: number }

export function CartLine({ line }: { line: Line }) {
  return <li>{line.name} × {line.qty}</li>
}

export function CartPanel({ menu, onCartChange }: { menu: Product[]; onCartChange?: (lines: Line[]) => void }) {
  const [lines, setLines] = useState<Line[]>([])
  const sorted = [...menu].sort((a, b) => a.price - b.price)   // ✗ sort 會改到原本的陣列

  function add(p: Product) {
    const hit = lines.find(l => l.id === p.id)
    if (hit) hit.qty += 1                                  // ✗ 改到 state 裡的物件
    else lines.push({ id: p.id, name: p.name, qty: 1 })    // ✗ 改到 state 陣列
    const next = [...lines]
    setLines(next)
    onCartChange?.(next)
  }

  return (
    <section>
      <ul aria-label="菜單">
        {sorted.map(p => (
          <li key={p.id}>
            {p.name} {p.price} 元 <button type="button" onClick={() => add(p)}>加入{p.name}</button>
          </li>
        ))}
      </ul>
      <ul aria-label="購物車">
        {lines.map(l => <CartLine key={l.id} line={l} />)}
      </ul>
    </section>
  )
}
