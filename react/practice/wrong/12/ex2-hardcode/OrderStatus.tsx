// 練習 2：OrderStatus（辨識聯合的 props）
// 問題：每個 prop 都是可選的，所以 <OrderStatus status="ready" />（沒有取餐碼）、
//       <OrderStatus status="preparing" pickupCode="A12" />（製作中卻有取餐碼）、<OrderStatus status="shipped" /> 都不會報錯，
//       畫面上出現「可以取餐，取餐碼」後面一片空白。
// 要求：把 props 改成辨識聯合（discriminated union），用 status 區分三種狀態，每種狀態只能、也一定要帶自己的資料：
//   - status: 'preparing' → minutesLeft: number            顯示「製作中，約 5 分鐘」
//   - status: 'ready'     → pickupCode: string             顯示「可以取餐，取餐碼 A12」
//   - status: 'cancelled' → reason: string、onReorder: () => void   顯示「已取消：售完」與「重新點餐」按鈕，按了呼叫 onReorder
// 畫面的文字與結構維持現在這樣（文字放在 <p role="status"> 裡）。
// 不能做的事：保留可選的 prop 再用 ! 或 as 斷言；用 any；把 status 寫成 string

type OrderStatusProps =
  | { status: 'preparing'; minutesLeft: number }
  | { status: 'ready'; pickupCode: string }
  | { status: 'cancelled'; reason: string; onReorder: () => void }

// 不在參數解構：minutesLeft 只存在其中一種狀態，要先用 props.status 收窄才讀得到
export function OrderStatus(props: OrderStatusProps) {
  switch (props.status) {
    case 'preparing':
      return <p role="status">製作中，約 5 分鐘</p>
    case 'ready':
      return <p role="status">可以取餐，取餐碼 A12</p>
    case 'cancelled':
      return (
        <div>
          <p role="status">已取消：{props.reason}</p>
          <button type="button" onClick={props.onReorder}>重新點餐</button>
        </div>
      )
    default:
      return props satisfies never   // 之後多一種狀態卻忘了處理，這一行會報錯
  }
}
