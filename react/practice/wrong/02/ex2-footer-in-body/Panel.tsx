// 練習 2：區塊 Panel（children）
// 錯誤寫法：footer 放進 panel-body 裡
import type { ReactNode } from 'react'

type Props = { title: string; children: ReactNode; footer?: ReactNode }

export function Panel({ title, children, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">
        {children}
        {footer !== undefined && <footer>{footer}</footer>}
      </div>
    </section>
  )
}
