type OrderStatusProps =
  | { status: 'preparing'; minutesLeft: number }
  | { status: 'ready'; pickupCode: string }
  | { status: 'cancelled'; reason: string; onReorder: () => void }

// 按鈕放在 switch 外面：製作中、可取餐也出現「重新點餐」
export function OrderStatus(props: OrderStatusProps) {
  let text: string
  switch (props.status) {
    case 'preparing': text = `製作中，約 ${props.minutesLeft} 分鐘`; break
    case 'ready': text = `可以取餐，取餐碼 ${props.pickupCode}`; break
    case 'cancelled': text = `已取消：${props.reason}`; break
  }
  return (
    <div>
      <p role="status">{text}</p>
      <button type="button" onClick={props.status === 'cancelled' ? props.onReorder : undefined}>重新點餐</button>
    </div>
  )
}
