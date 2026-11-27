/*
練習 2（之一）：每一頁的標題：分頁標題與可以被程式聚焦的 h1
問題：
  換頁之後瀏覽器分頁的標題永遠是「好咖啡」，讀螢幕軟體的使用者聽不出換到哪一頁。
要求：
  1. 用 React 19 的 <title> 元件把分頁標題設成「{title}｜好咖啡」，例如「購物車｜好咖啡」
     （<title> 的 children 必須是一個字串）
  2. <h1> 顯示 title，加上 tabIndex={-1}：程式可以把焦點移過來，但按 Tab 不會停在它上面
*/
import type { ReactNode } from 'react'

export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section>
      <title>{`${title}｜好咖啡`}</title>
      <h1 tabIndex={-1}>{title}</h1>
      {children}
    </section>
  )
}
