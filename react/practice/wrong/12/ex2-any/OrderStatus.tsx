export function OrderStatus(props: any) {
  switch (props.status) {
    case 'preparing':
      return <p role="status">製作中，約 {props.minutesLeft} 分鐘</p>
    case 'ready':
      return <p role="status">可以取餐，取餐碼 {props.pickupCode}</p>
    default:
      return (
        <div>
          <p role="status">已取消：{props.reason}</p>
          <button type="button" onClick={props.onReorder}>重新點餐</button>
        </div>
      )
  }
}
