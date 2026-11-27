import { ApiProperty } from '@nestjs/swagger'

// POST /orders 成功時回傳的形狀。只用在文件與型別，不做驗證
export class OrderResponse {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number

  @ApiProperty({ type: 'integer', example: 1 })
  customerId: number

  @ApiProperty({ type: 'integer', description: '總額（元）', example: 220 })
  total: number

  @ApiProperty({ enum: ['pending'], example: 'pending' })
  status: 'pending'
}
