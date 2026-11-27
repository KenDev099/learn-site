import type { ReactNode } from 'react'

type CardProps = {
  title: ReactNode
  badge?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function Card({ title, badge, footer, children }: CardProps) {
  return (
    <section className="card">
      <header>
        <h3>{title}</h3>
        {badge != null && <span className="badge">{badge}</span>}
      </header>
      <div className="body" />
      <footer>{children}{footer}</footer>
    </section>
  )
}
