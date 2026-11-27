// 訂單明細（已經寫好，不用改）：相信每一列都有 name。後端哪天少給一個欄位，line.name.trim() 就會在 render 時丟出 TypeError
import type { OrderLine } from '../../shared/api.ts'

export function OrderDetails({ lines }: { lines: readonly OrderLine[] }) {
  return (
    <ul aria-label="明細">
      {lines.map((line, i) => <li key={i}>{line.name.trim()} × {line.quantity}</li>)}
    </ul>
  )
}
