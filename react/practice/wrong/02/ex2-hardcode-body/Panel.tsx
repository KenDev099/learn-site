// 練習 2：區塊 Panel（children）
// 錯誤寫法：內容寫死，沒有用 children
import type { ReactNode } from 'react'

type Props = { title: string; children: ReactNode; footer?: ReactNode }

export function Panel({ title, footer }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body"><p>拿鐵</p><p>美式咖啡</p></div>
      {footer !== undefined && <footer>{footer}</footer>}
    </section>
  )
}
