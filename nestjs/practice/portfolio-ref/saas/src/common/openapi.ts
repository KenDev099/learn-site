import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiResponse } from '@nestjs/swagger'

// 所有錯誤回應共用一個 schema（第 15 課）：前端產生型別時只有一種錯誤格式
export class ErrorResponse {
  @ApiProperty({ example: 404 }) statusCode: number
  @ApiProperty({ example: 'NOT_FOUND', description: 'SCREAMING_SNAKE；程式判斷用這個，不要比對 message' }) errorCode: string
  @ApiProperty() message: string
  @ApiProperty({ description: '跟回應標頭 x-request-id 相同' }) requestId: string
}

const DESCRIPTIONS: Record<number, string> = {
  400: '輸入不正確（VALIDATION_FAILED）', 401: '沒有登入或 token 無效', 403: '沒有權限（FORBIDDEN）或已達方案上限（PLAN_LIMIT_REACHED）',
  404: '不存在，或屬於別的租戶（NOT_FOUND）', 409: '跟現有資料衝突', 410: '已經失效', 413: '太大', 415: '不支援的檔案類型', 429: '太多請求（RATE_LIMITED）',
}

export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(...statuses.map(status => ApiResponse({ status, description: DESCRIPTIONS[status], type: ErrorResponse })))
