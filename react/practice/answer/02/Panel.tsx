// 練習 2：區塊 Panel（children）
// 問題：菜單頁的每一區（咖啡、茶、點心）外框都一樣，只有標題和裡面的內容不同。現在標題和內容都寫死在元件裡。
// 用法：
//   <Panel title="咖啡" footer={<button type="button">看全部</button>}>
//     <p>拿鐵</p>
//     <p>美式咖啡</p>
//   </Panel>
// 要求：
//   1. props：title（string，必填）、children（ReactNode，必填）、footer?（ReactNode）
//   2. <h2> 顯示 title
//   3. 標籤中間的內容（children）放進 <div className="panel-body">，不管它是文字、元素還是陣列
//   4. 有傳 footer 才多一個 <footer>，內容是 footer；沒傳就不能有 <footer> 元素。<footer> 放在 panel-body 後面
// 不能做的事：用 any
import type { ReactNode } from 'react'

type Props = { title: string; children: ReactNode; footer?: ReactNode }

export function Panel({ title, children, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
      {footer !== undefined && <footer>{footer}</footer>}
    </section>
  )
}
