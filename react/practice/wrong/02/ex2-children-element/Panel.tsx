// 練習 2：區塊 Panel（children）
// 錯誤寫法：children 宣告成 ReactElement：文字、數字、陣列都傳不進來
import type { ReactElement, ReactNode } from 'react'

type Props = { title: string; children: ReactElement; footer?: ReactNode }

export function Panel({ title, children, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
      {footer !== undefined && <footer>{footer}</footer>}
    </section>
  )
}
