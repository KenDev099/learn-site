import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Response } from 'express'
import { tap, type Observable } from 'rxjs'

// 每個回應都帶 Server-Timing: app;dur=<毫秒>，瀏覽器 DevTools 的 Network → Timing 看得到
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now()   // 每個請求各自開始計時：寫在 intercept() 裡，不是檔案最上層
    const res = context.switchToHttp().getResponse<Response>()
    const record = () => res.setHeader('Server-Timing', `app;dur=${(performance.now() - start).toFixed(1)}`)
    // next 是成功、error 是失敗：兩條路都要記，錯誤回應才有標頭。錯誤本身照樣往外丟給 filter
    return next.handle().pipe(tap(record))
  }
}
