// 練習 2：區塊 Panel（children）
// 錯誤寫法：children 寫成可省略：<Panel title="咖啡" /> 不會報錯
import type { ReactNode } from 'react'

type Props = { title: string; children?: ReactNode; footer?: ReactNode }

export function Panel({ title, children, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
      {footer !== undefined && <footer>{footer}</footer>}
    </section>
  )
}
