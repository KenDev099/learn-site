import { HttpException } from '@nestjs/common'

// 預期內的錯誤一律用它丟：狀態碼＋給程式判斷的 errorCode（SCREAMING_SNAKE），message 給人看
export class ApiError extends HttpException {
  constructor(status: number, readonly errorCode: string, message: string) {
    super({ statusCode: status, errorCode, message }, status)
  }
}
