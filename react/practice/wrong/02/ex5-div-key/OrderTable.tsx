// 練習 5：訂單明細 OrderTable（Fragment 與 key）
// 錯誤寫法：有 key 但還是用 <div> 包：<tbody> 裡不能有 <div>
export type OrderLine = { productId: number; name: string; price: number; quantity: number; note?: string }

export function OrderTable({ lines }: { lines: readonly OrderLine[] }) {
  return (
    <table>
      <thead>
        <tr><th scope="col">品項</th><th scope="col">數量</th><th scope="col">小計</th></tr>
      </thead>
      <tbody>
        {lines.map(line => (
          // <>…</> 不能寫 key，要用完整的 <Fragment key>
          <div key={line.productId}>
            <tr>
              <th scope="row">{line.name}</th>
              <td>{line.quantity}</td>
              <td>${line.price * line.quantity}</td>
            </tr>
            {line.note && (
              <tr className="note">
                <td colSpan={3}>備註：{line.note}</td>
              </tr>
            )}
          </div>
        ))}
      </tbody>
    </table>
  )
}
