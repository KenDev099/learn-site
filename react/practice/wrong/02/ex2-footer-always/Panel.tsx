// 練習 2：區塊 Panel（children）
// 錯誤寫法：沒傳 footer 也 render 一個空的 <footer>
import type { ReactNode } from 'react'

type Props = { title: string; children: ReactNode; footer?: ReactNode }

export function Panel({ title, children, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
      <footer>{footer}</footer>
    </section>
  )
}
