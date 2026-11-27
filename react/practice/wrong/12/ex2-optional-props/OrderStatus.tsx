// status 改成字面值聯合，但其他 prop 還是可選：缺取餐碼、帶錯資料都不會報錯
type OrderStatusProps = {
  status: 'preparing' | 'ready' | 'cancelled'
  minutesLeft?: number
  pickupCode?: string
  reason?: string
  onReorder?: () => void
}

export function OrderStatus({ status, minutesLeft, pickupCode, reason, onReorder }: OrderStatusProps) {
  if (status === 'preparing') return <p role="status">製作中，約 {minutesLeft} 分鐘</p>
  if (status === 'ready') return <p role="status">可以取餐，取餐碼 {pickupCode}</p>
  return (
    <div>
      <p role="status">已取消：{reason}</p>
      <button type="button" onClick={onReorder}>重新點餐</button>
    </div>
  )
}
