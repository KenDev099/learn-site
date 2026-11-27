// 收據預覽：已經用 memo 包好了。這個檔案不用改
import { memo } from 'react'

export type Customer = { name: string; vip: boolean }
export type ReceiptLine = { name: string; price: number; quantity: number }

export function ReceiptView({ customer, lines }: { customer: Customer; lines: readonly ReceiptLine[] }) {
  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
  const final = customer.vip ? Math.round(total * 0.9) : total
  return (
    <section aria-label="收據">
      <h2>{customer.name}{customer.vip ? '（VIP 9 折）' : ''}</h2>
      <ul>
        {lines.map(l => <li key={l.name}>{l.name} x{l.quantity} ${l.price * l.quantity}</li>)}
      </ul>
      <p>合計 ${final}</p>
    </section>
  )
}

export const ReceiptPreview = memo(ReceiptView)
