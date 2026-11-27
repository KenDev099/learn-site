// 練習 5：訂單明細 OrderTable（Fragment 與 key）
// 問題：每個品項要 render 一列 <tr>，有備註的再多一列備註。兩個 <tr> 要包起來才能從 map 回傳，
//      現在用 <div> 包：<tbody> 裡不能放 <div>，React 會警告，瀏覽器解析這種 HTML 時也會把 <div> 丟到表格外面。
//      而且沒有備註的品項也多了一列空的「備註：」。
// 要求：
//   1. <tbody> 的直接子元素只能是 <tr>，不能多包任何元素
//   2. 每個品項的那一組要有 key，用 productId（測試會把品項順序反過來，原本的 <tr> 要跟著品項移動）
//   3. note 有內容才多一列備註；沒有 note 或 note 是空字串都不能有那一列
//   4. 小計是 price × quantity
// 不能做的事：修改 lines（它是凍結的）
export type OrderLine = { productId: number; name: string; price: number; quantity: number; note?: string }

export function OrderTable({ lines }: { lines: readonly OrderLine[] }) {
  return (
    <table>
      <thead>
        <tr><th scope="col">品項</th><th scope="col">數量</th><th scope="col">小計</th></tr>
      </thead>
      <tbody>
        {lines.map(line => (
          <div>
            <tr>
              <th scope="row">{line.name}</th>
              <td>{line.quantity}</td>
              <td>${line.price}</td>
            </tr>
            <tr className="note">
              <td colSpan={3}>備註：{line.note}</td>
            </tr>
          </div>
        ))}
      </tbody>
    </table>
  )
}
