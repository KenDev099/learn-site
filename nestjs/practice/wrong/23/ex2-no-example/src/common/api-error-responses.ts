import { applyDecorators } from '@nestjs/common'
import { ApiResponse } from '@nestjs/swagger'

import { ErrorResponse } from './error-response.dto.js'

export type ApiError = {
  status: number       // HTTP 狀態碼，例如 409
  errorCode: string    // 例如 'OUT_OF_STOCK'
  description: string  // 什麼情況會發生，例如「庫存不足」
}

// 每個錯誤一個 @ApiResponse：形狀都是 ErrorResponse，example 讓前端看到會收到哪個 errorCode
export function ApiErrorResponses(...errors: ApiError[]) {
  return applyDecorators(
    ...errors.map(({ status, errorCode, description }) =>
      ApiResponse({
        status,
        description: `${description}（errorCode: ${errorCode}）`,
        type: ErrorResponse,
      }),
    ),
  )
}
