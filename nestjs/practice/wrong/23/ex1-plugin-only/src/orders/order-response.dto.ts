// POST /orders 成功時回傳的形狀。只用在文件與型別，不做驗證
// 練習 1：每個欄位加上 @ApiProperty
export class OrderResponse {
  id: number
  customerId: number
  total: number
  status: 'pending'
}
