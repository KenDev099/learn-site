import { HttpException } from '@nestjs/common'

// 預期內的錯誤一律用它丟：狀態碼＋errorCode（契約的一部分，測試只比對這兩個），message 給人看
export class ApiError extends HttpException {
  constructor(status: number, readonly errorCode: string, message: string) {
    super({ statusCode: status, errorCode, message }, status)
  }
}

export const notFound = () => new ApiError(404, 'NOT_FOUND', '找不到')
export const forbidden = (message = '沒有權限') => new ApiError(403, 'FORBIDDEN', message)
export const planLimit = (what: string) => new ApiError(403, 'PLAN_LIMIT_REACHED', `已達方案上限：${what}`)
