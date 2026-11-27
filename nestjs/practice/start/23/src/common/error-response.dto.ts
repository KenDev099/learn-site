import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// 第 8 課的錯誤格式，寫成文件用的類別：@ApiProperty 手寫每個欄位，不靠 CLI 外掛
export class ErrorResponse {
  @ApiProperty({ example: 409 })
  statusCode: number

  @ApiProperty({ example: 'Conflict' })
  error: string

  // 一般是字串；400 驗證失敗時是「欄位 → 錯誤訊息陣列」（第 7 課的 errorFormat: 'grouped'）。文件要照實際的形狀寫
  @ApiProperty({
    description: '給人看的訊息，文案可能會改，前端不要拿來判斷',
    oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }],
    example: '商品 6 庫存不足：要 3，剩 2',
  })
  message: string | Record<string, string[]>

  @ApiProperty({ description: '給程式判斷用、不會變的錯誤代碼', example: 'OUT_OF_STOCK' })
  errorCode: string

  @ApiPropertyOptional({ description: '補充資料，例如哪一個商品、還剩幾個', type: 'object', additionalProperties: true })
  details?: Record<string, unknown>

  @ApiProperty({ example: '9b2c6a8e-1f3d-4c1a-a9e2-5d0f7e8b1c42' })
  requestId: string
}
