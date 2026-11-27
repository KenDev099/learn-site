// 練習 1：Card（children 與多個插槽）
// 問題：Card 只收兩個字串。購物車頁想在標題放 <em>、內容放一整張清單、底部放「結帳」按鈕，全部做不到。
// 要求：
//   1. props 改成 title、badge?、footer?、children，型別都是 ReactNode（字串、數字、JSX 都能傳）
//   2. title 放在 <h3>，children 放在 <div className="body">
//   3. badge 有傳才 render <span className="badge">（放在 <header> 裡、<h3> 後面）；
//      沒傳（undefined 或 null）時不能有這個 span。badge={0} 是「有傳」：要顯示 0
//   4. footer 有傳才 render <footer>；沒傳時整個 <footer> 都不能出現
// 不能做的事：把傳進來的內容轉成字串（JSX 會變成 [object Object]）
import type { ReactNode } from 'react'

type CardProps = {
  title: string
  text: string
}

export function Card({ title, text }: CardProps) {
  return (
    <section className="card">
      <header>
        <h3>{title}</h3>
      </header>
      <div className="body">{text}</div>
      <footer>沒有操作</footer>
    </section>
  )
}
