import { applyDecorators } from '@nestjs/common'

export type ApiError = {
  status: number       // HTTP 狀態碼，例如 409
  errorCode: string    // 例如 'OUT_OF_STOCK'
  description: string  // 什麼情況會發生，例如「庫存不足」
}

// 練習 2：把每個 ApiError 變成一個 @ApiResponse（type 是 ErrorResponse，example 帶出 errorCode），
//   再用 applyDecorators 組成一個裝飾器。用法：@ApiErrorResponses({ status: 409, errorCode: 'OUT_OF_STOCK', description: '庫存不足' })
export function ApiErrorResponses(...errors: ApiError[]) {
  return applyDecorators()
}
