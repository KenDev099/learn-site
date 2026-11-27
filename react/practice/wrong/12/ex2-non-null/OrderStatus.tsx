type OrderStatusProps = {
  status: 'preparing' | 'ready' | 'cancelled'
  minutesLeft?: number
  pickupCode?: string
  reason?: string
  onReorder?: () => void
}

// 用 ! 告訴 TypeScript「一定有」：使用的人漏傳時照樣通過檢查
export function OrderStatus(props: OrderStatusProps) {
  if (props.status === 'preparing') return <p role="status">製作中，約 {props.minutesLeft!.toFixed(0)} 分鐘</p>
  if (props.status === 'ready') return <p role="status">可以取餐，取餐碼 {props.pickupCode!}</p>
  return (
    <div>
      <p role="status">已取消：{props.reason!}</p>
      <button type="button" onClick={props.onReorder!}>重新點餐</button>
    </div>
  )
}
