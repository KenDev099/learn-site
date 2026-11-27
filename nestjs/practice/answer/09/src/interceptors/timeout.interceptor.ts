import { Injectable, ServiceUnavailableException, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { catchError, throwError, timeout, TimeoutError, type Observable } from 'rxjs'
import { Timeout } from '../timeout.decorator.js'

export const DEFAULT_TIMEOUT_MS = 3000

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ms = this.reflector.getAllAndOverride(Timeout, [context.getHandler(), context.getClass()]) ?? DEFAULT_TIMEOUT_MS
    return next.handle().pipe(
      timeout(ms),
      // 只把逾時換成 503；其他錯誤（404、409…）原樣丟出去，讓第 8 課的 filter 處理
      catchError(err => throwError(() => err instanceof TimeoutError
        ? new ServiceUnavailableException('處理逾時，請稍後再試', { errorCode: 'TIMEOUT' })
        : err)),
    )
  }
}
